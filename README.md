# LM 27 — League of Legends Manager 27

LCK · LPL · LEC · LCS를 풋볼 매니저처럼 운영하는 리그 오브 레전드 e스포츠 매니지먼트 팬게임.

플레이: https://2piece227.github.io/League-maneger-27/

## 로컬 실행

```
python tools/serve.py
```

http://localhost:5527 접속.

## 데이터 수집

```
node tools/scrape/scrape.mjs
```

Leaguepedia Cargo API에서 4대 리그 팀·선수(실명, 로고, 사진)를 받아 `data/*.json`에 저장한다. 데이터가 없으면 게임은 목업 데이터로 실행된다.

---

LM 27 was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
