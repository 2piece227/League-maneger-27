# 배경 음악 폴더

- `worlds/` : 메뉴 화면에서 도는 월즈 플레이리스트
- `draft/`  : 밴픽 화면 음악
- `victory/` : 승리 음악 (세트를 이기면 앞 25초, 매치를 이기면 최대 90초)
- `decider/` : Bo5 마지막 5세트 밴픽에 들어갈 때 잠깐 트는 입장 음악 (최대 60초, 중계로 넘어가면 줄어들며 끝남). 예: Silver Scrapes

## 곡 넣는 법 (코드 수정 없음)
1. GitHub 저장소에서 `assets/music/worlds` (또는 `draft`) 폴더로 들어간다
2. **Add file → Upload files** 로 mp3를 끌어다 놓고 **main** 에 커밋한다
3. 1~2분 뒤 사이트를 새로 고치면 플레이리스트에 들어가 있다 (목록은 30분마다 다시 읽는다)

파일 이름은 `가수 - 제목 (연도).mp3` 로 하면 재생기에 가수 · 제목 · 연도가 나뉘어 보인다.
예: `Imagine Dragons - Warriors (2014).mp3`, `Linkin Park - Heavy Is The Crown (2024).mp3`

- mp3 · m4a · ogg · wav · flac 가능. 한 파일 25MB 이하 (GitHub 웹 업로드 제한)
- 폴더가 비어 있으면 League of Legends 공식 사운드클라우드 곡을 대신 튼다
- 로컬에서 실행할 때는 폴더 목록을 못 읽으므로 `playlist.json` 에 파일 이름을 적는다
