import React from "react";

interface GreetingResult {
  icon: React.ReactNode;
  text: string;
  greetingText: string;
}

const sanitizeDisplayName = (name: string): string => {
  return name.trim().slice(0, 50).replace(/[<>]/g, "");
};

/**
 * Get special day greeting based on date
 */
export const getSpecialDayGreeting = (
  month: number,
  day: number,
  displayName: string,
): GreetingResult | null => {
  const specialDays: Record<string, GreetingResult> = {
    "1-1": {
      icon: "🎉",
      text: `Happy New Year, ${displayName}! 🎉`,
      greetingText: "Happy New Year",
    },
    "1-24": {
      icon: "🎓",
      text: `Happy Education Day, ${displayName}! 🎓`,
      greetingText: "Happy Education Day",
    },
    "2-4": {
      icon: "🎗️",
      text: `World Cancer Day, ${displayName}! 🎗️`,
      greetingText: "World Cancer Day",
    },
    "2-11": {
      icon: "👩‍🔬",
      text: `Women in Science Day, ${displayName}! 👩‍🔬`,
      greetingText: "Women in Science Day",
    },
    "2-14": {
      icon: "💝",
      text: `Happy Valentine's Day, ${displayName}! 💝`,
      greetingText: "Happy Valentine's Day",
    },
    "2-21": {
      icon: "🗣️",
      text: `Mother Language Day, ${displayName}! 🗣️`,
      greetingText: "Mother Language Day",
    },
    "3-8": {
      icon: "💪",
      text: `Happy Women's Day, ${displayName}! 💪`,
      greetingText: "Happy Women's Day",
    },
    "3-22": {
      icon: "💧",
      text: `Happy World Water Day, ${displayName}! 💧`,
      greetingText: "Happy World Water Day",
    },
    "4-7": {
      icon: "🏥",
      text: `Happy World Health Day, ${displayName}! 🏥`,
      greetingText: "Happy World Health Day",
    },
    "4-22": {
      icon: "🌍",
      text: `Happy Earth Day, ${displayName}! 🌍`,
      greetingText: "Happy Earth Day",
    },
    "5-1": {
      icon: "👷",
      text: `Happy Labor Day, ${displayName}! 👷`,
      greetingText: "Happy Labor Day",
    },
    "6-5": {
      icon: "🌱",
      text: `Happy Environment Day, ${displayName}! 🌱`,
      greetingText: "Happy Environment Day",
    },
    "7-17": {
      icon: "😄",
      text: `Happy World Emoji Day, ${displayName}! 😄`,
      greetingText: "Happy World Emoji Day",
    },
    "7-30": {
      icon: "👫",
      text: `Happy Friendship Day, ${displayName}! 👫`,
      greetingText: "Happy Friendship Day",
    },
    "8-12": {
      icon: "🌟",
      text: `Happy Youth Day, ${displayName}! 🌟`,
      greetingText: "Happy Youth Day",
    },
    "8-26": {
      icon: "🐕",
      text: `Happy International Dog Day, ${displayName}! 🐕`,
      greetingText: "Happy International Dog Day",
    },
    "9-8": {
      icon: "📚",
      text: `Happy Literacy Day, ${displayName}! 📚`,
      greetingText: "Happy Literacy Day",
    },
    "9-13": {
      icon: "💻",
      text: `Happy Programmer's Day, ${displayName}! 💻`,
      greetingText: "Happy Programmer's Day",
    },
    "9-21": {
      icon: "☮️",
      text: `Happy Peace Day, ${displayName}! ☮️`,
      greetingText: "Happy Peace Day",
    },
    "10-5": {
      icon: "👩‍🏫",
      text: `Happy Teachers' Day, ${displayName}! 👩‍🏫`,
      greetingText: "Happy Teachers' Day",
    },
    "10-10": {
      icon: "🧠",
      text: `Happy Mental Health Day, ${displayName}! 🧠`,
      greetingText: "Happy Mental Health Day",
    },
    "10-16": {
      icon: "🍽️",
      text: `Happy World Food Day, ${displayName}! 🍽️`,
      greetingText: "Happy World Food Day",
    },
    "10-29": {
      icon: "🌐",
      text: `Happy Internet Day, ${displayName}! 🌐`,
      greetingText: "Happy Internet Day",
    },
    "11-1": {
      icon: "🥗",
      text: `Happy World Vegan Day, ${displayName}! 🥗`,
      greetingText: "Happy World Vegan Day",
    },
    "11-10": {
      icon: "🔬",
      text: `Happy World Science Day, ${displayName}! 🔬`,
      greetingText: "Happy World Science Day",
    },
    "11-13": {
      icon: "💖",
      text: `Happy World Kindness Day, ${displayName}! 💖`,
      greetingText: "Happy World Kindness Day",
    },
    "11-19": {
      icon: "👨",
      text: `Happy International Men's Day, ${displayName}! 👨`,
      greetingText: "Happy International Men's Day",
    },
    "11-30": {
      icon: "🔒",
      text: `Happy Computer Security Day, ${displayName}! 🔒`,
      greetingText: "Happy Computer Security Day",
    },
    "12-1": {
      icon: "🎗️",
      text: `World AIDS Day, ${displayName}! 🎗️`,
      greetingText: "World AIDS Day",
    },
    "12-5": {
      icon: "🤲",
      text: `Happy Volunteer Day, ${displayName}! 🤲`,
      greetingText: "Happy Volunteer Day",
    },
    "12-10": {
      icon: "⚖️",
      text: `Happy Human Rights Day, ${displayName}! ⚖️`,
      greetingText: "Happy Human Rights Day",
    },
    "12-11": {
      icon: "⛰️",
      text: `Happy Mountain Day, ${displayName}! ⛰️`,
      greetingText: "Happy Mountain Day",
    },
  };

  // Check exact date match
  const exactKey = `${month}-${day}`;
  if (specialDays[exactKey]) {
    return specialDays[exactKey];
  }

  // Check date ranges
  if (month === 5 && day >= 1 && day <= 7) {
    return {
      icon: "🔐",
      text: `Happy World Password Day, ${displayName}! 🔐`,
      greetingText: "Happy World Password Day",
    };
  }
  if (month === 8 && day >= 1 && day <= 7) {
    return {
      icon: "🍺",
      text: `Happy International Beer Day, ${displayName}! 🍺`,
      greetingText: "Happy International Beer Day",
    };
  }

  return null;
};

/**
 * Get time-based greeting with special occasions
 */
export const getTimeBasedGreeting = (
  userName?: string,
  userToken?: { name?: string; email?: string } | null,
): GreetingResult => {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  let displayName = "there";
  if (userToken?.name) {
    displayName = sanitizeDisplayName(userToken.name);
  } else if (userName) {
    displayName = sanitizeDisplayName(userName);
  } else if (userToken?.email) {
    displayName = sanitizeDisplayName(userToken.email.split("@")[0]);
  }

  const specialDay = getSpecialDayGreeting(month, day, displayName);
  if (specialDay) {
    return specialDay;
  }

  let icon: React.ReactNode;
  let greetingText: string;

  if (hour >= 5 && hour < 12) {
    icon = "☀️";
    greetingText = "Good morning";
  } else if (hour >= 12 && hour < 17) {
    icon = "☀️";
    greetingText = "Good afternoon";
  } else if (hour >= 17 && hour < 22) {
    icon = "🌅";
    greetingText = "Good evening";
  } else {
    icon = "🌙";
    const lateNightMessages = [
      "Burning the midnight oil",
      "Still up? You're dedicated",
      "Night owl mode activated",
      "Coffee might be needed",
      "Early bird or night owl",
    ];

    if (hour >= 1 && hour <= 4) {
      const stableIndex = now.getMinutes() % lateNightMessages.length;
      greetingText = lateNightMessages[stableIndex];
    } else {
      greetingText = "Good night";
    }
  }

  return {
    icon,
    text: `${greetingText}, ${displayName}! ${icon}`,
    greetingText,
  };
};
