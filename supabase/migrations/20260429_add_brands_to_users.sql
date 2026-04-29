-- 브랜드별 접근 권한을 위한 users 테이블 변경
--   1) brands: 사용자가 볼 수 있는 브랜드 목록 (text[])
--      · admin: 빈 배열 또는 NULL 허용 (= 전체 브랜드)
--      · 브랜드장: 본인 브랜드만 (예: ARRAY['리미니'])
--   2) 기존 사용자 일괄 admin 승격 — 현재 모든 계정은 입력/보고서 권한자였음
--
-- 적용 방법:
--   Supabase 대시보드 → SQL Editor → 본 SQL 실행
--   (또는 CLI: supabase db push)

-- 1. brands 컬럼 추가 (text[], 기본 빈 배열)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS brands text[] DEFAULT ARRAY[]::text[];

-- 2. 기존 사용자 전원을 admin으로 승격 (1번 (a)안)
--    새로 만드는 브랜드장 계정은 admin UI에서 role='user' + 브랜드 지정으로 생성됨
UPDATE users
SET role = 'admin'
WHERE role IS DISTINCT FROM 'admin';

-- 확인용 (실행 후 결과)
-- SELECT id, name, role, brands FROM users ORDER BY role DESC, id;


