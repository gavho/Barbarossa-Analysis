import frontierImg from "@/assets/frontier.webp";
import leningradImg from "@/assets/leningrad.webp";
import smolenskImg from "@/assets/smolensk.webp";
import typhoonImg from "@/assets/typhoon.webp";
import bmFrontier from "@/assets/bm_frontier.webp";
import bmLeningrad from "@/assets/bm_leningrad.webp";
import bmSmolensk from "@/assets/bm_smolensk.webp";
import bmTyphoon from "@/assets/bm_typhoon.webp";

export type RegionId = "frontier" | "leningrad" | "smolensk" | "typhoon";
export type PageId = "home" | RegionId;
export type Bounds = [[number, number], [number, number]];

export interface Region {
  id: RegionId;
  title: string;
  dates: string;
  start: string;
  end: string;
  bounds: Bounds;
  text: string;
  image: string;
  thumb: string;
}

// Text and time windows from the Experience app; bounds are the Areas of Interest padded ~0.5°.
export const REGIONS: Region[] = [
  {
    id: "frontier",
    title: "Frontier Breakthrough",
    dates: "21 June – 4 August 1941",
    start: "1941-06-22",
    end: "1941-08-05",
    bounds: [[21.5, 47.8], [32.5, 51.8]],
    text:
      "Initial invasion corridor along the Soviet frontier during Operation Barbarossa, dominated by Army Group North and Army Group Center. This region captures the rapid breakthrough phase as German forces crossed the border and advanced into the western USSR.",
    image: frontierImg,
    thumb: bmFrontier,
  },
  {
    id: "leningrad",
    title: "Leningrad Approach",
    dates: "9 July – 9 September 1941",
    start: "1941-07-10",
    end: "1941-09-10",
    bounds: [[27.0, 56.8], [33.2, 60.3]],
    text:
      "Northern axis of advance toward Leningrad, dominated by Army Group North. This region captures a more constrained and directional advance, where German forces pushed toward the city but increasingly slowed due to extended lines, resistance, and logistical limitations.",
    image: leningradImg,
    thumb: bmLeningrad,
  },
  {
    id: "smolensk",
    title: "Smolensk Pocket",
    dates: "9 July – 9 September 1941",
    start: "1941-07-10",
    end: "1941-09-10",
    bounds: [[26.5, 52.6], [36.5, 57.4]],
    text:
      "Central axis of advance toward Moscow, dominated by Army Group Center. This region captures the transition from rapid breakthrough to large-scale encirclement operations and increasing resistance, as German forces concentrated around Smolensk and began experiencing reduced momentum.",
    image: smolenskImg,
    thumb: bmSmolensk,
  },
  {
    id: "typhoon",
    title: "Operation Typhoon",
    dates: "27 September – 12 October 1941",
    start: "1941-09-28",
    end: "1941-10-13",
    bounds: [[30.5, 49.6], [36.5, 57.4]],
    text:
      "Final operational axis toward Moscow, centered on Army Group Center's offensive. This region captures the attempted renewed push for decisive victory, followed by a rapid loss of momentum as environmental conditions, overstretched supply lines, and Soviet resistance halted the advance.",
    image: typhoonImg,
    thumb: bmTyphoon,
  },
];

export const HOME = {
  title: "Barbarossa's Lost Operational Paths",
  start: "1941-06-22",
  end: "1941-10-13",
  bounds: [[18, 45.5], [42, 61.5]] as Bounds,
  text:
    "Discover how data science reveals when Germany truly lost the Barbarossa Campaign. Our innovative approach reexamines historical maps—digitized from Hitler's daily strategic charts during 1941—and reconstructs the offensive across four key regions. This new analysis shows where German forces advanced, stalled, or changed plans, offering fresh insights into one of history's pivotal conflicts.",
  credits: [
    ["Gavin Ho", "GIS Programmer"],
    ["Dr. Sorin Adam Matei", "Military Data Science"],
    ["Dr. Robert Kirchubel", "Military Historian"],
    ["Dr. Joseph Hupy", "GIS Professor"],
  ],
  book:
    "Accompanies the upcoming publication 'Audacity and Friction: Operation Barbarossa and the Operational Level of Warfare' by Dr. Kirchubel and Dr. Matei (University of Oklahoma Press).",
  forcesUrl: "https://cla.purdue.edu/research/forces-initiative/",
};

export const region = (id: PageId) => REGIONS.find((r) => r.id === id);
export const timeWindow = (page: PageId) => {
  const r = region(page);
  return r ? { start: r.start, end: r.end } : { start: HOME.start, end: HOME.end };
};
export const pageBounds = (page: PageId) => region(page)?.bounds ?? HOME.bounds;
