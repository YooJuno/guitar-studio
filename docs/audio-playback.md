# 로컬 음원 연습 플레이어

`src/lib/track.ts`의 `LocalTrack`은 사용자가 선택한 음원을 브라우저에서 재생한다. MP3·WAV·M4A·OGG·FLAC 등은 해당 브라우저의 코덱 지원 범위에서 동작하며 파일 크기는 150MB까지 허용한다. 파일과 오디오 파형은 Firebase나 별도 서버에 업로드하지 않는다. 파일 선택은 기기 권한을 장기 저장하지 않으며 페이지를 새로 열면 다시 선택해야 한다.

## 처리 경로

```text
File → object URL → HTMLAudioElement
     → MediaElementAudioSourceNode
     → SoundTouchNode (AudioWorklet)
     → GainNode → 스피커 / 헤드폰
```

브라우저 미디어 요소가 원본을 읽고 디코딩한다. 전체 파일을 `arrayBuffer()`나 `decodeAudioData()`로 먼저 펼치지 않아 긴 녹음의 초기 메모리 사용을 줄인다. 실제 디코더 버퍼와 메모리 정책은 브라우저가 결정한다. [MediaElementAudioSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/MediaElementAudioSourceNode)를 사용하여 미디어 요소를 Web Audio 그래프에 연결한다.

## 템포와 키

현재 공개 배포된 `@soundtouchjs/audio-worklet@2.1.1`을 사용한다. SoundTouch 공식 API에 따라 미디어 요소의 재생 속도와 프로세서의 `playbackRate`를 같은 값으로 설정하고, 별도의 `pitchSemitones`를 조절한다. 미디어 요소의 `preservesPitch`는 끄고 프로세서가 속도에 따른 피치 변화를 보정한다. 앱에서 허용하는 범위는 속도 0.5–1.5배, 키 -12–+12반음이다. [공식 사용법](https://github.com/cutterbl/SoundTouchJS/blob/v2.1.1/packages/audio-worklet/README.md)

AudioWorklet을 사용할 수 없거나 초기화에 실패하면 기본 미디어 재생으로 돌아간다. 이 경우 `preservesPitch: true`로 템포 조절을 제공하고 `pitchSupported: false`를 알린다. 지원하지 않는 키 변경 요청은 오류로 거절한다. 처리 도중 워크렛이 실패하면 재생을 멈추므로 원래 키가 조용히 재생되는 일을 피한다. 브라우저 기본 보정의 의미는 [preservesPitch 문서](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch)에 설명되어 있다.

키를 크게 옮기거나 아주 느리게 재생하면 보컬·심벌·어택에 변형과 지연이 들릴 수 있다. 이 기능은 반주와 채보 연습을 위한 실시간 처리이며 스튜디오 마스터링 품질을 보장하지 않는다. 자동 조성 검출 기능은 아니므로 원곡 키가 필요하면 사용자가 지정한다.

## 시간·구간 반복

타임라인은 항상 [미디어 요소의 `currentTime`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)을 읽는다. JavaScript 경과 시간을 누적하여 재생 위치를 만들어내지 않는다. 화면에는 원본 음원의 초 단위 위치를 표시하므로 속도가 바뀌어도 A·B 지점은 같은 원본 구간이다.

- A·B는 파일 길이 안에서 정렬하며 기본 최소 간격은 0.25초이다. 파일 자체가 더 짧으면 전체 길이를 사용한다.
- 재생 중 프레임 검사와 `timeupdate`에서 B 도달을 확인하고 A로 이동한다. 화면 상태 통지는 최대 약 10Hz로 제한한다.
- 직접 탐색·멈춤·오류는 즉시 알린다. 탐색 시 프로세서를 새로 연결해 이전 위치의 처리 버퍼를 버린다.
- A–B는 오디오 샘플 단위 반복이 아니다. 탭이 백그라운드로 내려가면 타이머 제한 때문에 경계가 늦어질 수 있다. 전면 탭에서 연습한다.

## 리소스 수명

빠르게 다른 파일을 선택하면 이전 로드 요청을 취소하고 이전 응답이 새 파일 상태를 덮어쓰지 못하게 한다. 교체·해제 시 미디어 요소를 멈추고 URL을 제거하며, 노드와 포트·프레임 콜백·AudioContext를 정리한 뒤 object URL을 해제한다. 페이지가 숨겨져 떠날 때는 재생과 오디오 컨텍스트를 일시 정지한다. [object URL 해제](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)

SoundTouch 코드와 프로세서 URL은 실제 로컬 음원을 준비할 때 동적으로 읽는다. 미지원 브라우저와 서버 렌더링에서 `AudioWorkletNode`를 참조하는 모듈을 먼저 평가하지 않는다. Firebase도 비로그인 연습에는 Firestore를 읽지 않고 계정 설정을 사용할 때 클라이언트를 동적으로 로드한다.

## 검증 범위

`tests/track.test.ts`는 네이티브 미디어 시계 사용, 속도·키 파라미터 분리, 상태 갱신 제한, 반복·탐색 버퍼 초기화, 빠른 파일 교체, object URL·노드 해제, 미지원 및 처리 오류를 검사한다. 주입한 미디어·노드 경계로 자원 수명을 검증하며 실제 디코더·AudioWorklet의 음질을 인증하는 테스트는 아니다.

실제 브라우저의 390px 화면에서도 생성한 WAV 파일의 0.75배·−1반음 재생, 원음 키 지정, 3–6초 A–B 반복, 탐색·일시 정지를 확인했다. 해당 점검 중 콘솔 경고·오류는 없었다. 실제 휴대폰의 코덱·스피커 음질과 지연까지 확인한 것은 아니다.

## 오픈소스 고지

SoundTouchJS 2.1.1과 관련 네 패키지는 MPL-2.0으로 배포된다. 이전 버전의 LGPL 안내를 현재 버전에 적용하지 않았다. 라이브러리 소스를 수정하지 않고 공개 npm 패키지를 사용한다. 배포물에 [고지 파일](../public/third-party-notices.txt), 패키지 제공 고지, MPL-2.0 전문을 포함하며 고지 파일에서 정확한 릴리스 소스를 안내한다.

- [v2.1.1 소스와 라이선스](https://github.com/cutterbl/SoundTouchJS/tree/v2.1.1)
- [정확한 소스 커밋](https://github.com/cutterbl/SoundTouchJS/tree/d9e39a7ddcf74c7a145bbba45856f30068c82b79)
- [Mozilla MPL-2.0 전문](https://www.mozilla.org/en-US/MPL/2.0/)
