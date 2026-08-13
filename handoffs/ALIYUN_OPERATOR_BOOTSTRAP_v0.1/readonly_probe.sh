timeout 10s aliyun version >/dev/null 2>&1 && echo CLI=OK || echo CLI=FAIL
timeout 10s aliyun sts GetCallerIdentity >/dev/null 2>&1 && echo STS=OK || echo STS=FAIL
timeout 10s aliyun ram ListPoliciesForUser --UserName visionqa-staging-operator 2>/dev/null | jq -e 'any(.Policies.Policy[]?; .PolicyName=="VisionQAStagingOperatorBootstrapV01" and .PolicyType=="Custom")' >/dev/null 2>&1; case "${PIPESTATUS[*]}" in "0 0") echo POLICY=OK;; "0 1") echo POLICY=NOT_BOUND;; *) echo POLICY=FAIL;; esac
timeout 10s aliyun oss ls --limited-num 1 >/dev/null 2>&1 && echo OSS=OK || echo OSS=FAIL
timeout 10s aliyun rds DescribeDBInstances --RegionId cn-beijing --Engine PostgreSQL --PageSize 1 >/dev/null 2>&1 && echo RDS=OK || echo RDS=FAIL
timeout 10s aliyun fc ListFunctions --region cn-beijing --limit 1 --fcVersion v3 >/dev/null 2>&1 && echo FC=OK || echo FC=FAIL
timeout 10s aliyun actiontrail DescribeTrails --region cn-beijing >/dev/null 2>&1 && echo ACTIONTRAIL=OK || echo ACTIONTRAIL=FAIL
echo PROBE=COMPLETE
