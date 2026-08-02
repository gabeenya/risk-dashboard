-- 뒷광고 의심 모니터링 — 이미지(비전) 분석 결과 컬럼 추가
--   ad-watch-scan이 게시물 본문 이미지를 함께 가져와 Claude 비전으로 분석하면서,
--   실제로 몇 장의 이미지를 판별에 사용했는지 기록해 검수 화면에 표시한다.
--
-- 적용 방법:
--   Supabase 대시보드 → SQL Editor → 본 SQL 실행
--   (기존 ad_watch_candidates 테이블이 이미 있어야 함)

alter table ad_watch_candidates
  add column if not exists image_count integer not null default 0;
