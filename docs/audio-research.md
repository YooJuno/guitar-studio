# 튜너 설계와 참고 자료

## 입력과 프라이버시

마이크와 오디오 인터페이스의 LINE/Instrument 입력을 `getUserMedia()`로 받는다. 장치를 지정할 수 있고, 스테레오 인터페이스는 믹스·왼쪽·오른쪽 채널을 선택할 수 있다. 왼쪽·오른쪽 선택 시 `ChannelSplitterNode`로 실제 채널을 분리하므로 반대 위상 L/R이 섞여 사라지는 문제를 피할 수 있다. 모노 장치에서는 유일한 채널을 사용한다.

튜닝을 위한 브라우저 음성 처리(`echoCancellation`, `noiseSuppression`, `autoGainControl`)는 요청에서 끈다. 브라우저/장치가 설정을 무시할 수 있으므로 원본 DI 또는 Hi-Z 입력이 가장 유리하다. 입력은 스피커에 연결하지 않아 피드백을 만들지 않는다. 분석은 브라우저 메모리 안에서만 실행되며 녹음 파일·오디오 데이터를 서버로 보내지 않는다. 종료와 컴포넌트 정리 시 모든 트랙과 AudioContext를 해제한다.

- [MDN: getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN: 오디오 입력의 실제 설정](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)
- [MDN: ChannelSplitterNode](https://developer.mozilla.org/en-US/docs/Web/API/ChannelSplitterNode)

## 단음 모드

YIN의 차분 함수 → 누적 평균 정규화 → 첫 유효 최소점 선택을 직접 구현했다. 24–1400 Hz 범위를 검색한다. 계산용 샘플은 블록 평균 후 낮은 샘플레이트로 줄이고, 찾은 주기 주변에서 원본 샘플레이트의 차분을 다시 계산하여 보간한다. DC 오프셋·저입력·비주기성 신호를 제외한다. 여기의 confidence는 주기성 점수이며 실제 오차 확률을 뜻하지 않는다.

- [de Cheveigné & Kawahara, YIN (JASA, 2002)](https://www.ee.columbia.edu/~dpwe/e6820/papers/deChevK02-yin.pdf): 누적 평균 정규화 차분과 주기 최소점 선택의 근거.
- [McLeod & Wyvill, A Smarter Way to Find Pitch (2005)](https://www.cs.otago.ac.nz/graphics/Geoff/tartini/papers.html): 주기성/clarity와 피치 검출 방법 비교에 참고. MPM 코드를 가져오지는 않았다.

## 폴리 모드 — 실험 기능

[TC Electronic PolyTune 공식 설명서](https://service-tcgroup.tcelectronic.com/media/Polytune_DD_US.pdf)의 여러 개방현을 동시에 확인하는 UX를 참고했다. 상용 제품의 알고리즘이나 정확도를 재현했다고 주장하지 않는다.

선택한 튜닝의 개방현 주파수 각각에 대해 ±85센트 범위를 탐색한다. Hann 창을 적용한 32768점 radix-2 FFT를 직접 구현하고, 로그 스펙트럼 피크를 보간한 뒤 최대 7차 배음을 함께 살핀다. 배음의 주파수 정보를 기본음 추정에 가중 평균한다. 광대역 노이즈는 스펙트럼 에너지 집중도가 부족하면 제외하고, 낮은 현의 배음만으로 높은 현을 감지하는 오류는 낮은 현 배음의 진폭 추정으로 억제한다. 불확실한 현은 `null`로 반환하여 UI에 미검출 상태를 표시한다.

배음 살리언스는 [Klapuri, Multiple Fundamental Frequency Estimation by Summing Harmonic Amplitudes (ISMIR, 2006)](https://labrosa.ee.columbia.edu/~dpwe/papers/Klap06-multif0.pdf)에서 조사했다. 이 구현은 튜닝을 사전 정보로 사용하는 소규모 검출기이며 논문의 전체 알고리즘이나 평가 결과와 동일하지 않다. [Klapuri (2003)](https://www.ee.columbia.edu/~dpwe/papers/Klap03-multif0.pdf)는 동시 음원의 배음 겹침이 어려운 문제임을 설명한다.

## 지연과 한계

48 kHz 입력의 32768샘플은 약 **683 ms**, 44.1 kHz에서는 약 **743 ms** 길이다. 화면 갱신은 최대 약 12.5 Hz이다. 단음 검출은 최근 16384샘플만 써서 48 kHz에서 약 341 ms를 분석한다. 낮은 B0(약 30.87 Hz)도 충분한 주기를 포함하지만, 연주 직후에는 창에 이전 음과 무음이 섞이므로 소리가 안정될 때까지 기다려야 한다. 실제 반응 시간에는 오디오 인터페이스와 브라우저 버퍼도 더해진다.

- 폴리 모드는 개방현을 한 번 울려 대략적인 상태를 확인하는 용도이다. 마무리 튜닝은 한 현씩 수행한다.
- ±85센트를 벗어나거나 기본음이 매우 약한 현은 놓칠 수 있다. 전혀 다른 튜닝은 먼저 프리셋을 맞춘다.
- 옥타브 관계의 현과 서로 겹치는 배음을 한 채널에서 완전히 분리할 수 없다. 두 현의 음높이가 같거나 배음이 강하면 미검출 또는 오검출이 가능하다.
- DI/LINE 입력에서도 출력 레벨과 고조파, 클리핑, 험, 브라우저 처리에 영향을 받는다. 입력 게인을 클리핑 전까지 적절히 올린다.
- 코드 연주·복잡한 음악의 다중 음원 전사 기능이 아니다. 소리를 울리기 전부터 6개 음을 만들어 표시하지 않는다.

## 검증 범위

`tests/pitch.test.ts`는 실제 검출 함수에 합성 오디오 파형을 전달한다. 기타·5/6현 베이스 주파수, B0, 디튠, DC 오프셋, 강한 배음, 순음, 무음, 광대역 노이즈, 여섯 동시 현과 울리지 않은 현의 배음 오인 방지를 검사한다. 합성 테스트 통과는 실제 악기·오디오 인터페이스의 정확도 인증이 아니다. 실제 장치에서 마지막으로 청감과 비교해야 한다.
