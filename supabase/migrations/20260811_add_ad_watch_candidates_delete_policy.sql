-- ad_watch_candidates에 DELETE RLS 정책이 없어 "선택 삭제"가 조용히 실패하던 문제 수정
--   증상: 프런트엔드에서 삭제 요청은 HTTP 200/204로 "성공"처럼 보이지만
--   실제로는 RLS가 막아 0건 삭제됨(PostgREST는 RLS로 걸러진 DELETE를 에러 없이
--   "해당 행 0건"으로 처리하기 때문에 UI에서는 성공 토스트가 뜸).
--   SELECT/UPDATE/INSERT 정책은 있어서 조회·상태변경(적발등록/오탐제외)은 정상 동작했음.
--
-- 적용 방법: Supabase 대시보드 → SQL Editor → 본 SQL 실행 (또는 CLI: supabase db push)

drop policy if exists "ad_watch_candidates_delete" on ad_watch_candidates;
create policy "ad_watch_candidates_delete" on ad_watch_candidates
  for delete using (true);
