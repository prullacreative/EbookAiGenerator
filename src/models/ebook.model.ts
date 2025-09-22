
export interface Chapter {
  title: string;
  sections: string[];
  content: string;
}

export interface Ebook {
  title: string;
  chapters: Chapter[];
}
