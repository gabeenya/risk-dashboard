-- 위생(위생) 영역 체계 개편: 상세유형 'BK' 단일화, 상태 '모니터링'(표시상 '해충반품') 단일화.
-- 기존에 입력된 위생 레코드도 일괄 소급 변환한다.
UPDATE records SET subtype = 'BK'      WHERE type = '위생' AND subtype IS DISTINCT FROM 'BK';
UPDATE records SET status  = '모니터링' WHERE type = '위생' AND status  IS DISTINCT FROM '모니터링';
