-- 외식BG RO실 주간 리스크 진단 리포트 — 자동 발송 cron
--   Edge Function `weekly-report`를 매주 금요일 15:00 KST(06:00 UTC)에 트리거한다.
--   pg_cron, pg_net 확장이 필요하다(Supabase 대시보드 Database > Extensions에서 활성화).
--
-- 적용 방법:
--   Supabase 대시보드 → SQL Editor → 본 SQL 실행
--   이미 'weekly-report'라는 이름의 cron job이 등록되어 있다면(월요일 09:00 KST로 등록했던 것)
--   먼저 아래로 기존 job을 지우고 다시 실행할 것:
--     select cron.unschedule('weekly-report');

select cron.schedule(
  'weekly-report',
  '0 6 * * 5',
  $$
  select net.http_post(
    url := 'https://acbimacjlslxzzjutqyt.supabase.co/functions/v1/weekly-report',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_iB1ahsakvCxgpZd9s86kBw_oPD7r9PB"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
