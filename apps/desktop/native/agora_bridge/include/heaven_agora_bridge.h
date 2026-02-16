#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct heaven_agora_handle heaven_agora_handle;

typedef struct heaven_agora_event {
  int32_t kind;
  uint32_t uid;
  int32_t value;
  char message[256];
} heaven_agora_event;

enum heaven_agora_event_kind {
  HEAVEN_AGORA_EVENT_NONE = 0,
  HEAVEN_AGORA_EVENT_BOT_SPEAKING = 1,
  HEAVEN_AGORA_EVENT_BOT_SILENT = 2,
  HEAVEN_AGORA_EVENT_USER_JOINED = 3,
  HEAVEN_AGORA_EVENT_USER_LEFT = 4,
  HEAVEN_AGORA_EVENT_ERROR = 5,
};

int32_t heaven_agora_create(const char* app_id, heaven_agora_handle** out_handle);
void heaven_agora_destroy(heaven_agora_handle* handle);
int32_t heaven_agora_join(heaven_agora_handle* handle, const char* channel, const char* token, uint32_t uid);
int32_t heaven_agora_leave(heaven_agora_handle* handle);
int32_t heaven_agora_set_mic_enabled(heaven_agora_handle* handle, bool enabled);
int32_t heaven_agora_set_area_cn(heaven_agora_handle* handle, bool enabled);
int32_t heaven_agora_poll_event(heaven_agora_handle* handle, heaven_agora_event* out_event);
int32_t heaven_agora_last_error(heaven_agora_handle* handle, char* out_message, size_t out_size);

#ifdef __cplusplus
}
#endif
