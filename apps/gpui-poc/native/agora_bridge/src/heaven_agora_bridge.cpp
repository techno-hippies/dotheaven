#include "heaven_agora_bridge.h"

#include <IAgoraRtcEngine.h>

#include <cstring>
#include <deque>
#include <memory>
#include <mutex>
#include <string>

using namespace agora;
using namespace agora::rtc;

namespace {

constexpr int kBotSpeakThreshold = 25;

void write_message(char* dst, size_t dst_size, const std::string& message) {
  if (!dst || dst_size == 0) return;
  std::strncpy(dst, message.c_str(), dst_size - 1);
  dst[dst_size - 1] = '\0';
}

struct Bridge final : public IRtcEngineEventHandler {
  IRtcEngine* engine = nullptr;
  std::mutex mu;
  std::deque<heaven_agora_event> events;
  bool bot_speaking = false;

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

  void onError(int err, const char* msg) override {
    push_event(HEAVEN_AGORA_EVENT_ERROR, 0, err, msg ? msg : "agora_error");
  }

  void onUserJoined(uid_t uid, int elapsed) override {
    (void)elapsed;
    push_event(HEAVEN_AGORA_EVENT_USER_JOINED, static_cast<uint32_t>(uid), 0, "");
  }

  void onUserOffline(uid_t uid, USER_OFFLINE_REASON_TYPE reason) override {
    push_event(HEAVEN_AGORA_EVENT_USER_LEFT, static_cast<uint32_t>(uid), static_cast<int32_t>(reason), "");
  }

  void onAudioVolumeIndication(const AudioVolumeInfo* speakers, unsigned int speakerNumber, int totalVolume) override {
    (void)totalVolume;
    bool remote_speaking = false;
    for (unsigned int i = 0; i < speakerNumber; ++i) {
      const auto& speaker = speakers[i];
      if (speaker.uid != 0 && speaker.volume > kBotSpeakThreshold) {
        remote_speaking = true;
        break;
      }
    }

    if (remote_speaking == bot_speaking) return;
    bot_speaking = remote_speaking;
    push_event(
      remote_speaking ? HEAVEN_AGORA_EVENT_BOT_SPEAKING : HEAVEN_AGORA_EVENT_BOT_SILENT,
      0,
      0,
      "");
  }
};

}  // namespace

struct heaven_agora_handle {
  std::unique_ptr<Bridge> bridge;
};

extern "C" int32_t heaven_agora_create(const char* app_id, heaven_agora_handle** out_handle) {
  if (!app_id || !out_handle) return -1;

  auto handle = std::make_unique<heaven_agora_handle>();
  handle->bridge = std::make_unique<Bridge>();

  auto* engine = createAgoraRtcEngine();
  if (!engine) return -2;

  RtcEngineContext ctx{};
  ctx.appId = app_id;
  ctx.eventHandler = handle->bridge.get();

  int rc = engine->initialize(ctx);
  if (rc != 0) {
    engine->release(true);
    return rc;
  }

  handle->bridge->engine = engine;
  engine->enableAudio();
  engine->enableAudioVolumeIndication(300, 3, true);
  engine->setChannelProfile(CHANNEL_PROFILE_TYPE::CHANNEL_PROFILE_COMMUNICATION);
  engine->setClientRole(CLIENT_ROLE_TYPE::CLIENT_ROLE_BROADCASTER);

  *out_handle = handle.release();
  return 0;
}

extern "C" void heaven_agora_destroy(heaven_agora_handle* handle) {
  if (!handle) return;
  auto* bridge = handle->bridge.get();
  if (bridge && bridge->engine) {
    bridge->engine->leaveChannel();
    bridge->engine->release(true);
    bridge->engine = nullptr;
  }
  delete handle;
}

extern "C" int32_t heaven_agora_join(heaven_agora_handle* handle, const char* channel, const char* token, uint32_t uid) {
  if (!handle || !channel) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge || !bridge->engine) return -2;
  return bridge->engine->joinChannel(token ? token : "", channel, "", static_cast<uid_t>(uid));
}

extern "C" int32_t heaven_agora_leave(heaven_agora_handle* handle) {
  if (!handle) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge || !bridge->engine) return -2;
  return bridge->engine->leaveChannel();
}

extern "C" int32_t heaven_agora_set_mic_enabled(heaven_agora_handle* handle, bool enabled) {
  if (!handle) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge || !bridge->engine) return -2;
  return bridge->engine->muteLocalAudioStream(!enabled);
}

extern "C" int32_t heaven_agora_set_area_cn(heaven_agora_handle* handle, bool enabled) {
  if (!handle) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge || !bridge->engine) return -2;

  if (!enabled) return 0;
  // Parameter form is version-compatible across multiple native SDK lines.
  constexpr const char* kCnOnly = "{\"rtc.network.areaCode\": 1}";
  return bridge->engine->setParameters(kCnOnly);
}

extern "C" int32_t heaven_agora_poll_event(heaven_agora_handle* handle, heaven_agora_event* out_event) {
  if (!handle) return -1;
  auto* bridge = handle->bridge.get();
  if (!bridge) return -2;
  return bridge->pop_event(out_event);
}
