#include "heaven_agora_bridge.h"

#include <IAgoraService.h>
#include <NGIAgoraAudioTrack.h>
#include <NGIAgoraLocalUser.h>
#include <NGIAgoraRtcConnection.h>

#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <deque>
#include <filesystem>
#include <atomic>
#include <limits>
#include <memory>
#include <mutex>
#include <sstream>
#include <system_error>
#include <string>
#include <unordered_set>

using namespace agora;
using namespace agora::rtc;

namespace {

std::atomic<bool> g_fallback_runtime_active{false};

const char* error_name(int rc) {
  switch (std::abs(rc)) {
    case 0:
      return "ERR_OK";
    case 1:
      return "ERR_FAILED";
    case 2:
      return "ERR_INVALID_ARGUMENT";
    case 3:
      return "ERR_NOT_READY";
    case 4:
      return "ERR_NOT_SUPPORTED";
    case 5:
      return "ERR_REFUSED";
    case 7:
      return "ERR_NOT_INITIALIZED";
    case 8:
      return "ERR_INVALID_STATE";
    case 9:
      return "ERR_NO_PERMISSION";
    case 10:
      return "ERR_TIMEDOUT";
    case 22:
      return "ERR_RESOURCE_LIMITED";
    case 101:
      return "ERR_INVALID_APP_ID";
    case 109:
      return "ERR_TOKEN_EXPIRED";
    case 110:
      return "ERR_INVALID_TOKEN";
    case 77:
      return "ERR_FALLBACK_RESTART_REQUIRED";
    default:
      return "ERR_UNKNOWN";
  }
}

std::string make_error_message(const char* phase, int rc) {
  std::ostringstream out;
  out << phase << " failed: rc=" << rc << " (" << error_name(rc) << ")";
  if (std::abs(rc) == 3) {
    out << "; hint=SDK not ready. On Linux this usually means audio device init failed for this SDK bundle.";
  }
  return out.str();
}

void write_message(char* dst, size_t dst_size, const std::string& message) {
  if (!dst || dst_size == 0) return;
  std::strncpy(dst, message.c_str(), dst_size - 1);
  dst[dst_size - 1] = '\0';
}

uint32_t parse_uid(user_id_t user_id) {
  if (!user_id || !*user_id) return 0;
  char* end = nullptr;
  unsigned long parsed = std::strtoul(user_id, &end, 10);
  if (end == user_id || *end != '\0') return 0;
  if (parsed > std::numeric_limits<uint32_t>::max()) return 0;
  return static_cast<uint32_t>(parsed);
}

struct Bridge final : public rtc::IRtcConnectionObserver {
  explicit Bridge(const char* app_id_value) : app_id(app_id_value ? app_id_value : "") {}

  std::string app_id;
  bool area_cn_only = false;
  bool mic_enabled = true;
  bool audio_published = false;
  std::string active_channel;
  std::string active_token;
  std::string active_uid;
  base::IAgoraService* service = nullptr;
  agora_refptr<rtc::IRtcConnection> connection;
  rtc::ILocalUser* local_user = nullptr;
  agora_refptr<rtc::ILocalAudioTrack> local_audio_track;
  std::mutex mu;
  std::deque<heaven_agora_event> events;
  bool bot_speaking = false;
  std::unordered_set<std::string> remote_users;
  std::string last_error;
  std::string log_file_path;
  std::string sdk_data_dir;
  bool audio_processor_enabled = true;
  bool audio_device_enabled = true;
  bool teardown_unsafe = false;

  ~Bridge() override {
    shutdown();
  }

  void set_last_error(const std::string& message) {
    {
      std::lock_guard<std::mutex> lock(mu);
      last_error = message;
    }
    if (!message.empty()) {
      std::fprintf(stderr, "[heaven_agora_bridge] %s\n", message.c_str());
    }
  }

  std::string get_last_error() {
    std::lock_guard<std::mutex> lock(mu);
    return last_error;
  }

  void clear_last_error() {
    std::lock_guard<std::mutex> lock(mu);
    last_error.clear();
  }

  void configure_runtime_paths(base::AgoraServiceConfiguration& config) {
    namespace fs = std::filesystem;

    const char* xdg_state = std::getenv("XDG_STATE_HOME");
    const char* xdg_data = std::getenv("XDG_DATA_HOME");
    const char* home = std::getenv("HOME");

    fs::path state_dir;
    fs::path data_dir;
    if (xdg_state && *xdg_state) {
      state_dir = fs::path(xdg_state) / "heaven-gpui" / "agora";
    } else if (home && *home) {
      state_dir = fs::path(home) / ".local" / "state" / "heaven-gpui" / "agora";
    } else {
      state_dir = fs::path("/tmp") / "heaven-gpui" / "agora";
    }

    if (xdg_data && *xdg_data) {
      data_dir = fs::path(xdg_data) / "heaven-gpui" / "agora";
    } else if (home && *home) {
      data_dir = fs::path(home) / ".local" / "share" / "heaven-gpui" / "agora";
    } else {
      data_dir = fs::path("/tmp") / "heaven-gpui" / "agora";
    }

    std::error_code ec;
    fs::create_directories(state_dir, ec);
    if (ec) {
      log_file_path = "/tmp/heaven-gpui-agorasdk.log";
    } else {
      log_file_path = (state_dir / "agorasdk.log").string();
    }

    ec.clear();
    fs::create_directories(data_dir, ec);
    if (ec) {
      sdk_data_dir = "/tmp/heaven-gpui-agora";
      fs::create_directories(sdk_data_dir, ec);
    } else {
      sdk_data_dir = data_dir.string();
    }

    config.logConfig.filePath = log_file_path.c_str();
    config.logConfig.fileSizeInKB = 4096;
    config.logConfig.level = commons::LOG_LEVEL::LOG_LEVEL_INFO;
    config.configDir = sdk_data_dir.c_str();
    config.dataDir = sdk_data_dir.c_str();
  }

  int initialize_if_needed() {
    if (service) return 0;
    if (app_id.empty()) {
      set_last_error("initialize failed: missing Agora app id");
      return -1;
    }

    service = ::createAgoraService();
    if (!service) {
      set_last_error("initialize failed: createAgoraService returned null");
      return -2;
    }

    auto build_config = [&](bool enable_audio_processor, bool enable_audio_device) {
      base::AgoraServiceConfiguration cfg;
      cfg.appId = app_id.c_str();
      cfg.enableAudioProcessor = enable_audio_processor;
      cfg.enableAudioDevice = enable_audio_device;
      cfg.enableVideo = false;
      cfg.channelProfile = CHANNEL_PROFILE_COMMUNICATION;
      cfg.areaCode = area_cn_only ? rtc::AREA_CODE_CN : rtc::AREA_CODE_GLOB;
      configure_runtime_paths(cfg);
      return cfg;
    };

    clear_last_error();

    int rc = 0;
    {
      auto config = build_config(true, true);
      rc = service->initialize(config);
      audio_processor_enabled = true;
      audio_device_enabled = true;
      teardown_unsafe = false;
    }

    if (rc != 0 && std::abs(rc) == 3) {
      // Linux Java/server SDK bundles often fail with ERR_NOT_READY when the audio processor is enabled.
      // Retry with audio processor disabled so we can at least establish a receive-capable connection.
      auto config = build_config(false, true);
      int fallback_rc = service->initialize(config);
      if (fallback_rc == 0) {
        audio_processor_enabled = false;
        audio_device_enabled = true;
        teardown_unsafe = true;
        g_fallback_runtime_active.store(true, std::memory_order_relaxed);
        rc = 0;
        std::fprintf(
            stderr,
            "[heaven_agora_bridge] initialize fallback enabled: audio_processor=0 audio_device=1 (microphone publish disabled)\n");
      } else {
        rc = fallback_rc;
      }
    }

    if (rc != 0) {
      std::ostringstream msg;
      msg << make_error_message("initialize", rc)
          << "; app_id_len=" << app_id.size()
          << "; area=" << (area_cn_only ? "CN" : "GLOB")
          << "; config=(audio_processor=" << (audio_processor_enabled ? 1 : 0)
          << ",audio_device=" << (audio_device_enabled ? 1 : 0) << ")"
          << "; log_file=" << log_file_path
          << "; data_dir=" << sdk_data_dir;
      set_last_error(msg.str());
      service->release();
      service = nullptr;
      return rc;
    }

    rtc::RtcConnectionConfiguration conn_config;
    conn_config.channelProfile = CHANNEL_PROFILE_COMMUNICATION;
    conn_config.clientRoleType = CLIENT_ROLE_BROADCASTER;
    conn_config.autoSubscribeAudio = true;
    conn_config.autoSubscribeVideo = false;
    conn_config.enableAudioRecordingOrPlayout = audio_device_enabled;

    connection = service->createRtcConnection(conn_config);
    if (!connection) {
      set_last_error("createRtcConnection failed: service->createRtcConnection returned null");
      shutdown();
      return -3;
    }

    rc = connection->registerObserver(this);
    if (rc != 0) {
      set_last_error(make_error_message("registerObserver", rc));
      shutdown();
      return rc;
    }

    local_user = connection->getLocalUser();
    if (!local_user) {
      set_last_error("getLocalUser failed: returned null");
      shutdown();
      return -4;
    }

    // Voice sessions should publish microphone audio when the audio processor is available.
    // In fallback mode (audio processor disabled), setUserRole has been observed to crash.
    if (audio_processor_enabled) {
      local_user->setUserRole(CLIENT_ROLE_BROADCASTER);
    }
    if (audio_processor_enabled) {
      local_audio_track = service->createLocalAudioTrack();
      if (!local_audio_track) {
        set_last_error("createLocalAudioTrack failed: returned null");
        shutdown();
        return -5;
      }

      rc = local_audio_track->setEnabled(mic_enabled);
      if (rc != 0) {
        set_last_error(make_error_message("localAudioTrack.setEnabled", rc));
        shutdown();
        return rc;
      }
    } else {
      local_audio_track.reset();
    }

    clear_last_error();
    return 0;
  }

  int join(const char* channel, const char* token, uint32_t uid) {
    if (!channel || !*channel) {
      set_last_error("join failed: missing channel");
      return -1;
    }
    int rc = initialize_if_needed();
    if (rc != 0) return rc;

    active_channel = channel;
    active_token = token ? token : "";
    active_uid = std::to_string(uid);
    rc = connection->connect(active_token.c_str(), active_channel.c_str(), active_uid.c_str());
    if (rc != 0) {
      set_last_error(make_error_message("connect", rc));
      return rc;
    }

    if (local_user && local_audio_track && !audio_published) {
      rc = local_user->publishAudio(local_audio_track);
      if (rc != 0) {
        set_last_error(make_error_message("publishAudio", rc));
        shutdown();
        return rc;
      }
      audio_published = true;
    }

    clear_last_error();
    return 0;
  }

  int leave() {
    if (!connection) {
      set_last_error("leave failed: no active connection");
      return -2;
    }
    if (teardown_unsafe) {
      // This SDK bundle has been observed to crash in teardown paths under fallback mode.
      std::fprintf(stderr, "[heaven_agora_bridge] leave skipped in fallback mode to avoid SDK crash\n");
      clear_last_error();
      return 0;
    }
    shutdown();
    clear_last_error();
    return 0;
  }

  int set_mic_enabled(bool enabled) {
    mic_enabled = enabled;
    if (!audio_processor_enabled) {
      set_last_error("set_mic_enabled ignored: audio processor fallback mode is active");
      return 0;
    }
    if (!local_audio_track) {
      set_last_error("set_mic_enabled failed: local audio track is not initialized");
      return -2;
    }
    int rc = local_audio_track->setEnabled(enabled);
    if (rc != 0) {
      set_last_error(make_error_message("set_mic_enabled", rc));
    } else {
      clear_last_error();
    }
    return rc;
  }

  int set_area_cn_only(bool enabled) {
    if (service) {
      set_last_error("set_area_cn failed: engine is already initialized");
      return -3;
    }
    area_cn_only = enabled;
    clear_last_error();
    return 0;
  }

  void push_event(int32_t kind, uint32_t uid, int32_t value, const std::string& message) {
    std::lock_guard<std::mutex> lock(mu);
    heaven_agora_event event{};
    event.kind = kind;
    event.uid = uid;
    event.value = value;
    write_message(event.message, sizeof(event.message), message);
    events.push_back(event);
  }

  int pop_event(heaven_agora_event* out_event) {
    if (!out_event) return -1;
    std::lock_guard<std::mutex> lock(mu);
    if (events.empty()) return 1;
    *out_event = events.front();
    events.pop_front();
    return 0;
  }

  void shutdown() {
    if (teardown_unsafe) {
      std::lock_guard<std::mutex> lock(mu);
      remote_users.clear();
      bot_speaking = false;
      active_channel.clear();
      active_token.clear();
      active_uid.clear();
      return;
    }

    // Keep a local ref to avoid any accidental ordering issues while tearing down.
    auto conn = connection;
    auto track = local_audio_track;
    auto* user = local_user;

    if (conn) {
      conn->unregisterObserver(this);
    }

    if (user && track && audio_published) {
      user->unpublishAudio(track);
    }

    if (conn) {
      conn->disconnect();
    }

    local_audio_track.reset();
    local_user = nullptr;
    audio_published = false;
    connection.reset();

    if (service) {
      service->release();
      service = nullptr;
    }

    std::lock_guard<std::mutex> lock(mu);
    remote_users.clear();
    bot_speaking = false;
    active_channel.clear();
    active_token.clear();
    active_uid.clear();
  }

  bool should_skip_destroy() const {
    return teardown_unsafe;
  }

  void onConnected(const rtc::TConnectionInfo& connectionInfo, CONNECTION_CHANGED_REASON_TYPE reason) override {
    (void)connectionInfo;
    (void)reason;
  }

  void onDisconnected(const rtc::TConnectionInfo& connectionInfo, CONNECTION_CHANGED_REASON_TYPE reason) override {
    (void)connectionInfo;
    bool emit_silent = false;
    {
      std::lock_guard<std::mutex> lock(mu);
      if (bot_speaking) {
        bot_speaking = false;
        emit_silent = true;
      }
      remote_users.clear();
    }
    if (emit_silent) {
      push_event(HEAVEN_AGORA_EVENT_BOT_SILENT, 0, 0, "");
    }

    if (reason != CONNECTION_CHANGED_LEAVE_CHANNEL) {
      push_event(HEAVEN_AGORA_EVENT_ERROR, 0, static_cast<int32_t>(reason), "agora_disconnected");
    }
  }

  void onConnecting(const rtc::TConnectionInfo& connectionInfo, CONNECTION_CHANGED_REASON_TYPE reason) override {
    (void)connectionInfo;
    (void)reason;
  }

  void onReconnecting(const rtc::TConnectionInfo& connectionInfo, CONNECTION_CHANGED_REASON_TYPE reason) override {
    (void)connectionInfo;
    (void)reason;
  }

  void onReconnected(const rtc::TConnectionInfo& connectionInfo, CONNECTION_CHANGED_REASON_TYPE reason) override {
    (void)connectionInfo;
    (void)reason;
  }

  void onCustomUserInfoUpdated(user_id_t userId, const char* customUserInfo) override {
    (void)userId;
    (void)customUserInfo;
  }

  void onConnectionLost(const rtc::TConnectionInfo& connectionInfo) override {
    (void)connectionInfo;
    push_event(HEAVEN_AGORA_EVENT_ERROR, 0, 0, "agora_connection_lost");
  }

  void onLastmileQuality(const QUALITY_TYPE quality) override {
    (void)quality;
  }

  void onLastmileProbeResult(const LastmileProbeResult& result) override {
    (void)result;
  }

  void onTokenPrivilegeWillExpire(const char* token) override {
    (void)token;
    push_event(HEAVEN_AGORA_EVENT_ERROR, 0, 0, "agora_token_will_expire");
  }

  void onTokenPrivilegeDidExpire() override {
    push_event(HEAVEN_AGORA_EVENT_ERROR, 0, 0, "agora_token_expired");
  }

  void onConnectionFailure(const rtc::TConnectionInfo& connectionInfo, CONNECTION_CHANGED_REASON_TYPE reason) override {
    (void)connectionInfo;
    set_last_error("agora connection failure");
    push_event(HEAVEN_AGORA_EVENT_ERROR, 0, static_cast<int32_t>(reason), "agora_connection_failure");
  }

  void onUserJoined(user_id_t userId) override {
    uint32_t uid = parse_uid(userId);
    bool emit_speaking = false;
    {
      std::lock_guard<std::mutex> lock(mu);
      auto inserted = remote_users.emplace(userId ? userId : "");
      if (inserted.second && !bot_speaking) {
        bot_speaking = true;
        emit_speaking = true;
      }
    }
    push_event(HEAVEN_AGORA_EVENT_USER_JOINED, uid, 0, "");
    if (emit_speaking) {
      push_event(HEAVEN_AGORA_EVENT_BOT_SPEAKING, 0, 0, "");
    }
  }

  void onUserLeft(user_id_t userId, USER_OFFLINE_REASON_TYPE reason) override {
    uint32_t uid = parse_uid(userId);
    bool emit_silent = false;
    {
      std::lock_guard<std::mutex> lock(mu);
      remote_users.erase(userId ? userId : "");
      if (remote_users.empty() && bot_speaking) {
        bot_speaking = false;
        emit_silent = true;
      }
    }
    push_event(HEAVEN_AGORA_EVENT_USER_LEFT, uid, static_cast<int32_t>(reason), "");
    if (emit_silent) {
      push_event(HEAVEN_AGORA_EVENT_BOT_SILENT, 0, 0, "");
    }
  }

  void onTransportStats(const RtcStats& stats) override {
    (void)stats;
  }

  void onChannelMediaRelayStateChanged(int state, int code) override {
    (void)state;
    (void)code;
  }

  void onError(ERROR_CODE_TYPE error, const char* msg) override {
    set_last_error(msg ? msg : "agora_error");
    push_event(HEAVEN_AGORA_EVENT_ERROR, 0, static_cast<int32_t>(error), msg ? msg : "agora_error");
  }
};

}  // namespace

struct heaven_agora_handle {
  std::unique_ptr<Bridge> bridge;
};

extern "C" int32_t heaven_agora_create(const char* app_id, heaven_agora_handle** out_handle) {
  if (!app_id || !out_handle) return -1;
  if (g_fallback_runtime_active.load(std::memory_order_relaxed)) {
    std::fprintf(
        stderr,
        "[heaven_agora_bridge] refusing to create second Agora handle after fallback init; app restart required\n");
    return -77;
  }

  auto handle = std::make_unique<heaven_agora_handle>();
  handle->bridge = std::make_unique<Bridge>(app_id);

  *out_handle = handle.release();
  return 0;
}

extern "C" void heaven_agora_destroy(heaven_agora_handle* handle) {
  if (!handle) return;
  if (handle->bridge && handle->bridge->should_skip_destroy()) {
    std::fprintf(
        stderr,
        "[heaven_agora_bridge] destroy skipped in fallback mode to avoid SDK crash (leaking native handle)\n");
    (void)handle->bridge.release();
    delete handle;
    return;
  }
  delete handle;
}

extern "C" int32_t heaven_agora_join(heaven_agora_handle* handle, const char* channel, const char* token, uint32_t uid) {
  if (!handle || !channel) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge) return -2;
  return bridge->join(channel, token, uid);
}

extern "C" int32_t heaven_agora_leave(heaven_agora_handle* handle) {
  if (!handle) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge) return -2;
  return bridge->leave();
}

extern "C" int32_t heaven_agora_set_mic_enabled(heaven_agora_handle* handle, bool enabled) {
  if (!handle) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge) return -2;
  return bridge->set_mic_enabled(enabled);
}

extern "C" int32_t heaven_agora_set_area_cn(heaven_agora_handle* handle, bool enabled) {
  if (!handle) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge) return -2;
  return bridge->set_area_cn_only(enabled);
}

extern "C" int32_t heaven_agora_poll_event(heaven_agora_handle* handle, heaven_agora_event* out_event) {
  if (!handle) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge) return -2;
  return bridge->pop_event(out_event);
}

extern "C" int32_t heaven_agora_last_error(heaven_agora_handle* handle, char* out_message, size_t out_size) {
  if (!handle || !out_message || out_size == 0) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge) return -2;
  write_message(out_message, out_size, bridge->get_last_error());
  return 0;
}
