import { Injectable, signal } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Ebook, Chapter } from '../models/ebook.model';

// This is a simplified interface for the ToC structure we expect from Gemini
interface TocStructure {
  title: string;
  chapters: {
    title: string;
    sections: string[];
  }[];
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private genAI!: GoogleGenAI;
  public error = signal<string | null>(null);

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      const errorMessage = 'API key for Google Gemini is not configured.';
      this.error.set(errorMessage);
      console.error(errorMessage);
    } else {
        this.genAI = new GoogleGenAI({ apiKey });
    }
  }

  async generateTableOfContents(topic: string): Promise<TocStructure | null> {
    if (!this.genAI) return null;
    this.error.set(null);
    try {
      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Génère une table des matières détaillée pour un ebook sur le sujet de "${topic}". L'ebook est destiné aux débutants sur ce sujet. Il doit inclure une introduction, au moins 4 chapitres principaux avec des sous-sections claires, et une conclusion. Le titre principal de l'ebook doit être accrocheur et en rapport avec le sujet.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Le titre principal de l'ebook." },
              chapters: {
                type: Type.ARRAY,
                description: 'La liste des chapitres.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: 'Le titre du chapitre.' },
                    sections: {
                      type: Type.ARRAY,
                      description: 'Liste des sous-sections ou points clés à couvrir dans le chapitre.',
                      items: { type: Type.STRING }
                    }
                  }
                }
              }
            }
          }
        }
      });
      const jsonStr = response.text.trim();
      return JSON.parse(jsonStr) as TocStructure;
    } catch (e) {
      console.error('Error generating table of contents:', e);
      this.error.set('Failed to generate the table of contents. Please check the console for details.');
      return null;
    }
  }

  async generateChapterContent(topic: string, chapterTitle: string, sections: string[]): Promise<string> {
    if (!this.genAI) return '';
    this.error.set(null);
    try {
      const prompt = `Rédige le contenu détaillé pour le chapitre "${chapterTitle}" d'un ebook pour débutants sur le sujet "${topic}". Couvre les points suivants : ${sections.join(', ')}. Adopte un ton pédagogique, clair et engageant. Utilise des exemples concrets pour illustrer les concepts. Structure le contenu avec des titres et des listes si nécessaire. Formate la réponse en Markdown simple.`;
      
      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      return response.text;
    } catch (e) {
      console.error(`Error generating content for chapter "${chapterTitle}":`, e);
      this.error.set(`Failed to generate content for chapter: ${chapterTitle}.`);
      return `Error generating content for this chapter.`;
    }
  }
}