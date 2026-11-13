// Towns for drawing phase and advance lines by name: [lon, lat], with the spellings the AGS milestones use as aliases.
// shortcut: hand-entered to about 0.02°, about 2 km; add a town here when a line needs one that is missing.
export const TOWNS: { name: string; aka?: string[]; ll: [number, number] }[] = [
  { name: "Kovel", aka: ["Kowel"], ll: [24.71, 51.21] },
  { name: "Lutsk", aka: ["Luck", "Łuck"], ll: [25.33, 50.75] },
  { name: "Brody", ll: [25.15, 50.08] },
  { name: "Lviv", aka: ["L'vov", "Lvov", "Lemberg", "Lwów"], ll: [24.03, 49.84] },
  { name: "Volodymyr-Volynskyi", aka: ["Vladimir-Volynsky", "Wlodzimierz"], ll: [24.32, 50.85] },
  { name: "Sokal", ll: [24.28, 50.48] },
  { name: "Rava-Ruska", aka: ["Rawa Ruska"], ll: [23.62, 50.23] },
  { name: "Przemysl", aka: ["Przemyśl", "Peremyshl"], ll: [22.77, 49.78] },
  { name: "Hrubieszow", aka: ["Hrubieszów"], ll: [23.89, 50.81] },
  { name: "Radekhiv", aka: ["Radziechów"], ll: [24.64, 50.28] },
  { name: "Berestechko", ll: [25.11, 50.36] },
  { name: "Zolochiv", aka: ["Zloczow", "Złoczów"], ll: [24.9, 49.81] },
  { name: "Stryi", aka: ["Stryj"], ll: [23.85, 49.26] },
  { name: "Drohobych", aka: ["Drohobycz"], ll: [23.5, 49.35] },
  { name: "Ivano-Frankivsk", aka: ["Stanislav", "Stanislau", "Stanisławów"], ll: [24.71, 48.92] },
  { name: "Kolomyia", aka: ["Kolomea"], ll: [25.04, 48.53] },
  { name: "Ternopil", aka: ["Tarnopol"], ll: [25.59, 49.55] },
  { name: "Kremenets", aka: ["Krzemieniec"], ll: [25.73, 50.1] },
  { name: "Dubno", ll: [25.74, 50.42] },
  { name: "Rivne", aka: ["Rowne", "Rovno"], ll: [26.25, 50.62] },
  { name: "Ostroh", aka: ["Ostrog"], ll: [26.52, 50.33] },
  { name: "Sarny", ll: [26.6, 51.34] },
  { name: "Volochysk", aka: ["Volochisk"], ll: [26.18, 49.53] },
  { name: "Husiatyn", aka: ["Gusyatin"], ll: [26.19, 49.07] },
  { name: "Chernivtsi", aka: ["Czernowitz", "Cernauti"], ll: [25.94, 48.29] },
  { name: "Kamianets-Podilskyi", aka: ["Kamenets-Podolsky"], ll: [26.58, 48.68] },
  { name: "Khmelnytskyi", aka: ["Proskurov"], ll: [26.99, 49.42] },
  { name: "Starokostiantyniv", aka: ["Starokonstantinov"], ll: [27.21, 49.76] },
  { name: "Shepetivka", aka: ["Shepetovka"], ll: [27.06, 50.18] },
  { name: "Zviahel", aka: ["Novograd-Volynsky", "Novohrad-Volynskyi"], ll: [27.62, 50.59] },
  { name: "Korosten", ll: [28.64, 50.95] },
  { name: "Ovruch", ll: [28.8, 51.32] },
  { name: "Mozyr", ll: [29.25, 52.05] },
  { name: "Zhytomyr", aka: ["Zhitomir"], ll: [28.66, 50.25] },
  { name: "Berdychiv", aka: ["Berdichev"], ll: [28.6, 49.9] },
  { name: "Koziatyn", aka: ["Kazatin"], ll: [28.84, 49.72] },
  { name: "Vinnytsia", aka: ["Vinnitsa"], ll: [28.47, 49.23] },
  { name: "Zhmerynka", aka: ["Zhmerinka"], ll: [28.11, 49.04] },
  { name: "Mohyliv-Podilskyi", aka: ["Mogilev-Podolsky"], ll: [27.79, 48.45] },
  { name: "Haisyn", aka: ["Gaisin"], ll: [29.39, 48.81] },
  { name: "Uman", ll: [30.22, 48.75] },
  { name: "Balta", ll: [29.62, 47.94] },
  { name: "Podilsk", aka: ["Kotovsk"], ll: [29.53, 47.75] },
  { name: "Pervomaisk", ll: [30.85, 48.04] },
  { name: "Novoukrainka", ll: [31.53, 48.32] },
  { name: "Kropyvnytskyi", aka: ["Kirovograd", "Kirovohrad"], ll: [32.26, 48.51] },
  { name: "Zvenyhorodka", aka: ["Zvenigorodka"], ll: [30.97, 49.08] },
  { name: "Korsun", ll: [31.26, 49.42] },
  { name: "Smila", aka: ["Smela"], ll: [31.87, 49.22] },
  { name: "Cherkasy", aka: ["Cherkassy"], ll: [32.06, 49.44] },
  { name: "Kremenchuk", aka: ["Kremenchug"], ll: [33.42, 49.07] },
  { name: "Kryvyi Rih", aka: ["Krivoy Rog"], ll: [33.39, 47.91] },
  { name: "Dnipro", aka: ["Dnepropetrovsk", "Dnipropetrovsk"], ll: [35.05, 48.46] },
  { name: "Zaporizhzhia", aka: ["Zaporozhye"], ll: [35.14, 47.84] },
  { name: "Mykolaiv", aka: ["Nikolaev"], ll: [31.99, 46.97] },
  { name: "Odesa", aka: ["Odessa"], ll: [30.73, 46.48] },
  { name: "Kherson", ll: [32.62, 46.64] },
  { name: "Kaniv", aka: ["Kanev"], ll: [31.46, 49.75] },
  { name: "Bila Tserkva", aka: ["Belaya Tserkov"], ll: [30.11, 49.8] },
  { name: "Fastiv", aka: ["Fastov"], ll: [29.91, 50.08] },
  { name: "Vasylkiv", aka: ["Vasilkov"], ll: [30.32, 50.18] },
  { name: "Kyiv", aka: ["Kiev"], ll: [30.52, 50.45] },
  { name: "Pereiaslav", aka: ["Pereyaslav"], ll: [31.45, 50.07] },
  { name: "Chernihiv", aka: ["Chernigov"], ll: [31.29, 51.49] },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ'’]/g, "").toLowerCase().replace(/[\s-]+/g, " ").trim();
const INDEX = new Map(TOWNS.flatMap((t) => [t.name, ...(t.aka ?? [])].map((n) => [norm(n), t] as const)));

/** A town by any of its names; "Kiev / Kyiv" tries each part. */
export const findTown = (text: string) => text.split("/").map((p) => INDEX.get(norm(p))).find(Boolean) ?? null;

/** "Kovel - Lutsk, Brody" → the towns in order, or the names it does not know. */
export function parseTowns(text: string): { towns: typeof TOWNS; unknown: string[] } {
  const parts = text.split(/\s+[-–—]\s+|,|;|\n/).map((p) => p.trim()).filter(Boolean);
  const towns = parts.map(findTown);
  return { towns: towns.filter((t) => t !== null), unknown: parts.filter((_, i) => !towns[i]) };
}

/** The nearest town within maxKm of a clicked point, so lines drawn on the map snap to the towns they name. */
export function snapTown([lon, lat]: number[], maxKm = 12) {
  const kx = Math.cos((lat * Math.PI) / 180) * 111.32;
  let best: (typeof TOWNS)[number] | null = null, bestKm = maxKm;
  for (const t of TOWNS) {
    const d = Math.hypot((t.ll[0] - lon) * kx, (t.ll[1] - lat) * 110.57);
    if (d <= bestKm) { best = t; bestKm = d; }
  }
  return best;
}
