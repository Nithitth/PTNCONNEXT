// Pictures for the TCAS "Top University" window: each university's emblem and a
// main-campus photo, all from Wikimedia Commons (files in public/tcas/).
// Licences need the credits shown on the page (see TcasCredits) and in public/tcas/CREDITS.md.

export type ImageCredit = { title: string; author: string; licence: string; url: string };

export type UniversityArt = {
  emblem: string;
  campus: string;
  campusName: string;
  credits: ImageCredit[];
};

const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(" ", "_"))}`;
const credit = (title: string, author: string, licence: string): ImageCredit => ({ title, author, licence, url: commons(title) });

/** Keyed by TCAS university id (TCAS_UNIVERSITIES in tcas.ts). */
export const UNIVERSITY_ART: Record<string, UniversityArt> = {
  "001": {
    emblem: "/tcas/emblem-001.svg",
    campus: "/tcas/campus-001.jpg",
    campusName: "หอประชุมจุฬาลงกรณ์มหาวิทยาลัย",
    credits: [
      credit("Chulalongkorn University emblem.svg", "Chulalongkorn University", "Public domain"),
      credit("Chulalongkorn University Auditorium.jpg", "Supanut Arunoprayote", "CC BY-SA 4.0"),
    ],
  },
  "002": {
    emblem: "/tcas/emblem-002.svg",
    campus: "/tcas/campus-002.jpg",
    campusName: "หอประชุมมหาวิทยาลัยเกษตรศาสตร์ บางเขน",
    credits: [
      credit("Kasetsart Sublogo-TH.svg", "Kasetsart University", "Public domain"),
      credit("Main auditorium of Kasetsart University (Bangkok).jpg", "abhichartt", "Public domain"),
    ],
  },
  "005": {
    emblem: "/tcas/emblem-005.svg",
    campus: "/tcas/campus-005.jpg",
    campusName: "ตึกโดม ท่าพระจันทร์",
    credits: [
      credit("Emblem of Thammasat University.svg", "Royal Thai Cabinet Press", "Public domain"),
      credit("Dome Building, Thammasat University at night.jpg", "Supanut Arunoprayote", "CC BY 4.0"),
    ],
  },
  "006": {
    emblem: "/tcas/emblem-006.svg",
    campus: "/tcas/campus-006.jpg",
    campusName: "วิทยาเขตศาลายา",
    credits: [
      credit("Mahidol U.svg", "Mahidol University", "Public domain"),
      credit("Mahidol University Salaya campus's courtyard 4.jpg", "B20180", "CC BY-SA 4.0"),
    ],
  },
  "009": {
    emblem: "/tcas/emblem-009.svg",
    campus: "/tcas/campus-009.jpg",
    campusName: "ประสานมิตร",
    credits: [
      credit("Logo of Srinakharinwirot University.svg", "Srinakharinwirot University", "Public domain"),
      credit("Srinakharinwirot University Bangkok.jpg", "Chainwit.", "CC BY-SA 4.0"),
    ],
  },
};
