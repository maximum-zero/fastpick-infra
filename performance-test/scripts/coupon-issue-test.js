import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { scenario } from "k6/execution";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";

/**
 * [Configuration] 전역 환경 변수 및 엔드포인트 설정
 */
const BASE_URL = "http://192.168.56.111";
const API_URLS = {
  ISSUE: `${BASE_URL}/api/v1/coupon-issues`,
};

/**
 * [Dataset] 사전 생성된 1,000명의 유저 인증 정보(CSV) Load
 */
const users = new SharedArray("users", function () {
  return papaparse.parse(open("./users.csv"), { header: true }).data;
});

/**
 * [Test Scenario] 1,000명의 동시 접속자가 쿠폰 발급을 시도하는 선착순 시나리오
 * - 1,000 VU가 각각 1회씩 반복하여 총 1,000건의 트랜잭션 발생
 */
export const options = {
  scenarios: {
    coupon_race: {
      executor: "per-vu-iterations",
      vus: 1000,
      iterations: 1,
      maxDuration: "3m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  /**
   * [Authentication] VU 인덱스에 매핑되는 유저 토큰 추출
   */
  const userIndex = __VU - 1;
  const user = users[userIndex % users.length];
  const token = user.token || user.accessToken;
  const couponId = 19;

  /**
   * [Synchronization] Barrier 대기를 통한 대규모 동시 요청 유도
   * - 시나리오 시작 후 10초 시점에 전원 동시 발사
   */
  const raceStartTime = 10;
  const passedTime = (Date.now() - scenario.startTime) / 1000;
  const waitToRace = raceStartTime - passedTime;

  if (waitToRace > 0) {
    sleep(waitToRace);
  }

  /**
   * [Action] 쿠폰 발급 API 호출 수행
   */
  const issuePayload = JSON.stringify({ couponId });
  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };

  const res = http.post(API_URLS.ISSUE, issuePayload, params);

  /**
   * [Validation] 비즈니스 로직 및 시스템 정합성 검증
   * - 200/202: 발급 성공 또는 대기열 진입
   * - 400(CP04/CP05): 비즈니스 재고 소진 (정상 범위)
   */
  check(res, {
    "is acceptable response": (r) =>
      r.status === 200 || r.status === 202 || r.status === 400,
    "success or out of stock": (r) => {
      if (r.status === 200 || r.status === 202) return true;
      if (
        r.status === 400 &&
        (r.json().code === "CP04" || r.json().code === "CP05")
      )
        return true;
      return false;
    },
    "no system error": (r) => r.status !== 500 && r.status !== 0,
  });
}
