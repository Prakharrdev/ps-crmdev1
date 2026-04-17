export const DEPARTMENT_TWITTER_HANDLES: Record<string, string> = {
  "DMRC": "@OfficialDMRC",
  "NHAI": "@NHAI_Official",
  "PWD": "@DelhiPwd",
  "MCD": "@MCD_Delhi",
  "NDMC": "@tweetndmc",
  "DJB": "@DelhiJalBoard",
  "DISCOM": "@bsesdelhi @tatapower_ddl",
  "DELHI_POLICE": "@DelhiPolice",
  "TRAFFIC_POLICE": "@dtptraffic",
  "FOREST_DEPT": "@dofwgnctd",
  "DPCC": "@DPCC_Pollution"
};

// Map of category_id to specific handle (overrides department handle if present)
// Based on delhi_categories_twitter.csv
export const CATEGORY_TWITTER_HANDLES: Record<number, string> = {
  1: "@OfficialDMRC",
  2: "@OfficialDMRC",
  3: "@OfficialDMRC",
  4: "@OfficialDMRC",
  5: "@OfficialDMRC",
  6: "@OfficialDMRC",
  7: "@NHAI_Official",
  8: "@NHAI_Official",
  9: "@NHAI_Official",
  10: "@NHAI_Official",
  11: "@DelhiPwd",
  12: "@DelhiPwd",
  13: "@DelhiPwd",
  14: "@DelhiPwd",
  15: "@MCD_Delhi",
  16: "@MCD_Delhi",
  17: "@MCD_Delhi",
  18: "@MCD_Delhi",
  19: "@MCD_Delhi",
  20: "@MCD_Delhi",
  21: "@MCD_Delhi",
  22: "@MCD_Delhi",
  23: "@tweetndmc",
  24: "@tweetndmc",
  25: "@tweetndmc",
  26: "@tweetndmc",
  27: "@DelhiJalBoard",
  28: "@DelhiJalBoard",
  29: "@DelhiJalBoard",
  30: "@DelhiJalBoard",
  31: "@bsesdelhi @tatapower_ddl",
  32: "@bsesdelhi @tatapower_ddl",
  33: "@bsesdelhi @tatapower_ddl",
  34: "@bsesdelhi @tatapower_ddl",
  35: "@DelhiPolice",
  36: "@dtptraffic",
  37: "@dtptraffic",
  38: "@dtptraffic",
  39: "@dofwgnctd",
  40: "@DPCC_Pollution",
  41: "@DPCC_Pollution",
  42: "@DPCC_Pollution"
};

const MEDIA_HANDLES = "@TOIIndiaNews @htTweets @ZeeNews";

export interface AccountabilityHandles {
  primary: string;
  escalated: string;
  tier: 1 | 2 | 3 | 4;
}

export function getTieredTwitterHandles(
  categoryId: number | null | undefined, 
  department: string | null | undefined,
  upvoteCount: number = 0
): AccountabilityHandles {
  let primary = "";
  
  if (categoryId && CATEGORY_TWITTER_HANDLES[categoryId]) {
    primary = CATEGORY_TWITTER_HANDLES[categoryId];
  } else if (department) {
    const normalized = department.trim().toUpperCase();
    primary = DEPARTMENT_TWITTER_HANDLES[normalized] || "@MCD_Delhi";
  } else {
    primary = "@MCD_Delhi";
  }

  let escalated = "";
  let tier: 1 | 2 | 3 | 4 = 1;

  if (upvoteCount >= 100) {
    escalated = `@LGDelhi @CMODelhi ${MEDIA_HANDLES}`;
    tier = 4;
  } else if (upvoteCount >= 50) {
    escalated = "@LGDelhi @CMODelhi";
    tier = 3;
  } else if (upvoteCount >= 20) {
    escalated = "@LGDelhi";
    tier = 2;
  }

  return { primary, escalated, tier };
}
