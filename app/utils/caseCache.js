import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEYS = {
  USER_CASES: "cache_user_cases_",
  ALL_CASES: "cache_all_cases",
  COMPLETED_CASES: "cache_completed_cases",
  CACHE_TIMESTAMP: "cache_timestamp_"
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Save cases to local cache for instant loading
 */
export const saveCasesToCache = async (caseKey, cases) => {
  try {
    const cacheData = {
      cases,
      timestamp: Date.now()
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.log("[CaseCache] Error saving cases:", error);
  }
};

/**
 * Get cached cases if they exist and are fresh
 */
export const getCachedCases = async (cacheKey) => {
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (!cached) return null;

    const { cases, timestamp } = JSON.parse(cached);
    const isExpired = Date.now() - timestamp > CACHE_DURATION;

    if (isExpired) {
      // Clear expired cache
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    return cases;
  } catch (error) {
    console.log("[CaseCache] Error retrieving cache:", error);
    return null;
  }
};

/**
 * Clear all case caches
 */
export const clearAllCaseCaches = async () => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const caseKeys = allKeys.filter(key => key.startsWith("cache_"));
    await AsyncStorage.multiRemove(caseKeys);
  } catch (error) {
    console.log("[CaseCache] Error clearing caches:", error);
  }
};

/**
 * Get cache key for user's cases
 */
export const getUserCaseCacheKey = (uid) => CACHE_KEYS.USER_CASES + uid;

/**
 * Get cache key for completed cases
 */
export const getCompletedCasesCacheKey = () => CACHE_KEYS.COMPLETED_CASES;

/**
 * Get cache key for all cases
 */
export const getAllCasesCacheKey = () => CACHE_KEYS.ALL_CASES;
