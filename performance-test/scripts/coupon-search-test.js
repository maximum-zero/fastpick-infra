import http from "k6/http";
import { check, sleep } from "k6";
import { randomItem } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";

/**
 * [Configuration] 테스트 단계별 부하 설정 (Step Load Test)
 */
export const options = {
  stages: [
    { duration: "30s", target: 30 },
    { duration: "1m", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(99)<2500"],
    http_req_failed: ["rate<0.01"],
  },
};

/**
 * [Dataset] 검색 데이터 및 필터 유형 정의
 */
const EXISTING_KEYWORDS = [
  "29CM",
  "BALANCE",
  "HOKA",
  "KITSUNE",
  "LAST",
  "NEW",
  "NIKE",
  "OFF",
  "PATAGONIA",
  "SOTO",
  "기강해이",
  "단독",
  "로우",
  "방지",
  "백팩",
  "스니커즈",
  "에디션",
  "재킷",
  "조던",
  "티셔츠",
  "팬츠",
];
const FILTER_TYPES = ["ALL", "READY", "ISSUING", "CLOSED"];
const BASE_URL = "http://192.168.56.111";

export default function () {
  /**
   * [Strategy] Redis Cache Hit/Miss 전략적 분배 (7:3)
   * - Hit (70%): 캐시 레이어의 성능 및 데이터 제공 능력 검증
   * - Miss (30%): 캐시 부재 시 DB 직접 조회 및 오프로딩 부하 측정
   */
  const randomVal = Math.random();
  let search;
  if (randomVal < 0.7) {
    // [Cache Hit Case] 실제 존재하는 인덱싱된 키워드 사용
    search = randomItem(EXISTING_KEYWORDS);
  } else {
    // [Cache Miss Case] 동적 키워드 생성을 통한 원천 DB 조회 유도
    search = `GHOST_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  const filterType = randomItem(FILTER_TYPES);

  /**
   * [Action] 쿠폰 검색 및 필터링 API 호출
   */
  const url = `${BASE_URL}/api/v1/coupons?search=${encodeURIComponent(search)}&filterType=${filterType}`;
  const res = http.get(url);

  /**
   * [Validation] 시스템 응답 무결성 검증
   */
  check(res, {
    "is status 200": (r) => r.status === 200,
    "response contains data": (r) => r.json() !== null,
  });

  /**
   * [Simulation] 실제 사용자 유입 간격 모사 (Thinking Time)
   */
  sleep(Math.random() * 0.2 + 0.1);
}
