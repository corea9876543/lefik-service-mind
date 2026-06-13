# 레이밴 음성 질문 — 네이티브 컴패니언 골격

웹 앱(`../glasses/`)은 D-pad + Neural Handwriting(텍스트)로 안경에서 작동합니다.
**음성 질문**은 네이티브 경로가 필요해 이 골격을 둡니다.

> ⚠️ **검증된 사실 (v0.7.0 기준, 2026-06)**
> - iOS SPM: `https://github.com/facebook/meta-wearables-dat-ios` (v0.7.0)
> - Android Maven: `com.meta.wearable:mwdat-core:0.7.0`, `:mwdat-camera:0.7.0`, `:mwdat-mockdevice:0.7.0`
> - 매니페스트: `com.meta.wearable.mwdat.APPLICATION_ID`
> - 확인된 능력: **카메라 스트리밍 · 디스플레이 출력 · 세션 라이프사이클 · MockDevice(하드웨어 없이 테스트)**
> - **안경 마이크 직접 캡처 API는 v0.7에서 미확인** → 아래는 **폰 마이크 + 온디바이스 STT**로 음성을 받고, 답을 **렌즈 디스플레이**에 띄우는 구조. 디스플레이/오디오 정확한 심볼은 https://wearables.developer.meta.com/docs/develop/ 확인.

## 데이터 흐름 (음성)

```
폰 마이크 ─(SFSpeechRecognizer / Android SpeechRecognizer)─▶ 텍스트
   │  POST {ASK_BACKEND}/ask { question, target }
   ▼  답변(JSON)
컴패니언 앱 ─(MWDAT 디스플레이 API)─▶ 레이밴 렌즈에 1~3문장
```
`{ASK_BACKEND}`는 `../backend/`(Worker 또는 Node)와 동일. **웹·안경이 같은 백엔드 공유.**

## iOS (Swift)

**Package.swift / SPM**: `https://github.com/facebook/meta-wearables-dat-ios` @ `0.7.0`
**Info.plist**: `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`, + MWDAT 앱 ID 설정

```swift
import Speech
import MetaWearablesDAT   // TODO: 실제 모듈명 SDK 확인

let ASK_BACKEND = "https://claude-glasses-ask.<계정>.workers.dev"

// 1) 세션 시작 (MWDAT 라이프사이클) — 안경 연결/디스플레이 권한
// 2) 폰 마이크 → STT
func onVoiceButton() {
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ko-KR"))!
    // ... SFSpeechAudioBufferRecognitionRequest로 받은 최종 텍스트를 ask()에 전달
    ask(question: recognizedText, target: "model")
}

func ask(question: String, target: String) {
    var req = URLRequest(url: URL(string: "\(ASK_BACKEND)/ask")!)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["question": question, "target": target])
    URLSession.shared.dataTask(with: req) { data, _, _ in
        guard let data, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let answer = j["answer"] as? String else { return }
        DispatchQueue.main.async {
            // 3) 렌즈에 표시 — MWDAT 디스플레이 API
            // mwdatSession.display.showText(answer)   // TODO: 실제 API 확인
        }
    }.resume()
}
```

## Android (Kotlin)

**`gradle/libs.versions.toml`**
```toml
mwdat = "0.7.0"
mwdat-core = { group = "com.meta.wearable", name = "mwdat-core", version.ref = "mwdat" }
mwdat-mockdevice = { group = "com.meta.wearable", name = "mwdat-mockdevice", version.ref = "mwdat" }
```
**AndroidManifest** (`<application>` 안)
```xml
<meta-data android:name="com.meta.wearable.mwdat.APPLICATION_ID" android:value="your_app_id"/>
<!-- + RECORD_AUDIO 권한 -->
```
```kotlin
const val ASK_BACKEND = "https://claude-glasses-ask.<계정>.workers.dev"

fun onVoiceButton() {
    // 폰 SpeechRecognizer(ko-KR) → 최종 텍스트
    ask(recognizedText, target = "model")
}
fun ask(question: String, target: String) {
    val body = JSONObject(mapOf("question" to question, "target" to target)).toString()
    httpPost("$ASK_BACKEND/ask", body) { json ->
        val answer = json.optString("answer")
        runOnUiThread { /* mwdatSession.display.showText(answer)  // TODO: 실제 API */ }
    }
}
```

## 단계
- [ ] MWDAT SDK 통합 (iOS SPM / Android Maven, v0.7.0)
- [ ] 메타 개발자 프리뷰 등록 + 본인 안경 페어링 (또는 **MockDevice로 하드웨어 없이** 디스플레이 테스트)
- [ ] 폰 마이크 권한 + STT (ko-KR)
- [ ] `ASK_BACKEND` = 배포된 Worker/Node 주소
- [ ] 디스플레이 출력 API 정확한 심볼을 SDK 샘플(`/samples`)·문서에서 확인해 `TODO` 교체
- [ ] (가능 시) 안경 마이크 직접 캡처 — SDK 버전 업데이트 추적

> 저는 이 환경에서 실제 안경/Xcode/Android Studio 빌드를 못 하므로, 위는 **검증된 좌표 + 골격**입니다. MockDevice로 하드웨어 없이도 디스플레이 흐름은 미리 검증 가능합니다.
