import { ITiers } from "../../interfaces/i.tiers";

export const tiers: ITiers[] = [
  {
    id: 1,
    name: "Free",
    price: 0,
    features: {
      seats: 2,
      projects: 1,
      frameworks: 1,
    },
  },
  {
    id: 2,
    name: "Team",
    price: 139,
    features: {
      seats: 0,
      projects: 10,
      frameworks: 0,
    },
  },
  {
    id: 3,
    name: "Growth",
    price: 299,
    features: {
      seats: 0,
      projects: 50,
      frameworks: 0,
    },
  },
  {
    id: 4,
    name: "Enterprise",
    price: 799,
    features: {
      seats: 0,
      projects: 0,
      frameworks: 0,
    },
  },
];
