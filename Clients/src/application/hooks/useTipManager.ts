import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { ENTITY_TIPS, Tip } from "../config/entityTips";

interface TipState {
  dismissedTips: number[]; // Array of dismissed tip indices
}

const getStorageKey = (entityName: string, userId: number) =>
  `verifywise_tips_${entityName}_${userId}`;

const getDismissedTips = (storageKey: string): number[] => {
  const savedState = localStorage.getItem(storageKey);
  if (!savedState) return [];

  try {
    const parsed: TipState = JSON.parse(savedState);
    return parsed.dismissedTips || [];
  } catch (error) {
    console.error("Failed to parse tip state:", error);
    return [];
  }
};

export const useTipManager = (entityName: string) => {
  const { userId } = useAuth();
  const [currentTip, setCurrentTip] = useState<Tip | null>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState<number | null>(null);

  // Get tips for this entity
  const entityTips = ENTITY_TIPS[entityName] || [];

  // Load tip state from localStorage
  useEffect(() => {
    if (!userId || entityTips.length === 0) {
      setCurrentTip(null);
      setCurrentTipIndex(null);
      return;
    }

    const storageKey = getStorageKey(entityName, userId);
    const dismissedTips = getDismissedTips(storageKey);

    // Find the first tip that hasn't been dismissed
    const nextTipIndex = entityTips.findIndex((_, index) => !dismissedTips.includes(index));

    if (nextTipIndex !== -1) {
      setCurrentTip(entityTips[nextTipIndex]);
      setCurrentTipIndex(nextTipIndex);
    } else {
      // All tips have been dismissed
      setCurrentTip(null);
      setCurrentTipIndex(null);
    }
  }, [userId, entityName, entityTips]);

  // Dismiss current tip
  const dismissTip = useCallback(() => {
    if (!userId || currentTipIndex === null) return;

    const storageKey = getStorageKey(entityName, userId);
    const dismissedTips = getDismissedTips(storageKey);

    // Add current tip to dismissed list
    if (!dismissedTips.includes(currentTipIndex)) {
      dismissedTips.push(currentTipIndex);
    }

    // Save updated state
    const newState: TipState = { dismissedTips };
    localStorage.setItem(storageKey, JSON.stringify(newState));

    // Hide the tip immediately
    setCurrentTip(null);
    setCurrentTipIndex(null);
  }, [userId, entityName, currentTipIndex]);

  return {
    currentTip,
    dismissTip,
    hasTips: entityTips.length > 0,
    currentTipNumber: currentTipIndex !== null ? currentTipIndex + 1 : 0,
    totalTips: entityTips.length,
  };
};
