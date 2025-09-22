import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { GeminiService } from './services/gemini.service';
import { Ebook, Chapter } from './models/ebook.model';

// To avoid TypeScript errors with CDN-loaded libraries
declare var html2canvas: any;
declare var jspdf: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GeminiService],
})
export class AppComponent {
  private geminiService = inject(GeminiService);

  @ViewChild('ebookContainer') ebookContainer!: ElementRef<HTMLDivElement>;
  
  ebookState = signal<'idle' | 'generating' | 'completed' | 'error' | 'exporting'>('idle');
  generationProgress = signal({ current: 0, total: 0, message: '' });
  ebook = signal<Ebook | null>(null);
  ebookTopic = signal('');
  componentError = signal<string | null>(null);
  
  // Font size state
  fontSize = signal<'sm' | 'base' | 'lg' | 'xl'>('base');

  isGenerating = computed(() => this.ebookState() === 'generating');
  isCompleted = computed(() => this.ebookState() === 'completed');
  isIdle = computed(() => this.ebookState() === 'idle');
  isExporting = computed(() => this.ebookState() === 'exporting');

  // Computed signal for dynamic CSS class based on font size
  fontSizeClass = computed(() => {
    switch (this.fontSize()) {
      case 'sm': return 'text-sm';
      case 'base': return 'text-base';
      case 'lg': return 'text-lg';
      case 'xl': return 'text-xl';
      default: return 'text-base';
    }
  });

  // React to errors from the service
  serviceError = this.geminiService.error;
  
  constructor() {
      effect(() => {
          if (this.serviceError()) {
              this.ebookState.set('error');
          }
      });
  }

  /**
   * Sets the font size for the ebook content.
   * @param size The desired font size.
   */
  setFontSize(size: 'sm' | 'base' | 'lg' | 'xl'): void {
    this.fontSize.set(size);
  }

  async generateEbook(): Promise<void> {
    const topic = this.ebookTopic().trim();
    if (!topic) {
      this.componentError.set('Please provide a topic for your ebook.');
      this.ebookState.set('error');
      return;
    }

    this.componentError.set(null);
    this.ebookState.set('generating');
    this.generationProgress.set({ current: 0, total: 1, message: 'Generating table of contents...' });

    const toc = await this.geminiService.generateTableOfContents(topic);

    if (!toc || !toc.chapters || toc.chapters.length === 0) {
      this.ebookState.set('error');
      this.generationProgress.set({ current: 0, total: 0, message: 'Could not generate a valid table of contents.' });
      return;
    }

    const totalChapters = toc.chapters.length;
    this.generationProgress.set({ current: 0, total: totalChapters, message: 'Table of contents generated. Generating chapters...' });

    const generatedChapters: Chapter[] = [];
    for (let i = 0; i < toc.chapters.length; i++) {
      const chapterSpec = toc.chapters[i];
      this.generationProgress.update(p => ({...p, current: i + 1, message: `Generating chapter ${i + 1}/${totalChapters}: ${chapterSpec.title}`}));
      
      const content = await this.geminiService.generateChapterContent(topic, chapterSpec.title, chapterSpec.sections);
      generatedChapters.push({ ...chapterSpec, content });
    }

    this.ebook.set({
      title: toc.title,
      chapters: generatedChapters
    });

    this.ebookState.set('completed');
  }

  parseMarkdown(text: string): string {
    if (!text) return '';
    let html = text
      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-semibold mt-6 mb-2 text-indigo-300">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-8 mb-4 text-indigo-400 border-b border-gray-600 pb-2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-extrabold mt-8 mb-4 text-indigo-300">$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-indigo-500 pl-4 italic text-gray-400 my-4">$1</blockquote>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-300">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-red-300 rounded px-2 py-1 text-sm">$1</code>')
      .replace(/\n\n/g, '</p><p class="my-4 leading-relaxed">')
      .replace(/\n/g, '<br>');

    // Handle lists
    html = html.replace(/(\r\n|\n)?\s*[\-\*] (.*)/g, '<li>$2</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    return `<p class="my-4 leading-relaxed">${html}</p>`;
  }

  async exportToPdf(): Promise<void> {
    this.componentError.set(null);
    this.ebookState.set('exporting');
    const content = this.ebookContainer.nativeElement;
    const originalWidth = content.style.width;

    // Use a timeout to allow the UI to update before this heavy, blocking task starts
    setTimeout(async () => {
      try {
        content.classList.add('exporting-pdf');
        content.style.width = '595pt'; // A4 width in points

        const { jsPDF } = jspdf;
        const pdf = new jsPDF('p', 'pt', 'a4');

        await pdf.html(content, {
          callback: (doc: any) => {
            // Add page numbers to the PDF footer
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
              doc.setPage(i);
              doc.setFontSize(10);
              doc.setTextColor(150); // A light gray color
              doc.text(
                `Page ${i} of ${pageCount}`,
                doc.internal.pageSize.getWidth() / 2,
                doc.internal.pageSize.getHeight() - 20,
                { align: 'center' }
              );
            }

            // Save the PDF
            const safeTitle = this.ebook()?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'ebook';
            doc.save(`${safeTitle}.pdf`);

            // Cleanup and reset state
            content.style.width = originalWidth;
            content.classList.remove('exporting-pdf');
            this.ebookState.set('completed');
          },
          html2canvas: {
            scale: 2, // Higher scale for better image quality
            backgroundColor: '#1f2937', // Match content background (bg-gray-800)
            useCORS: true,
          },
          autoPaging: 'text',
          margin: [40, 30, 40, 30],
        });
      } catch (error) {
        console.error("Failed to export PDF:", error);
        this.componentError.set('An unexpected error occurred during PDF export.');
        
        // Cleanup on error
        content.style.width = originalWidth;
        content.classList.remove('exporting-pdf');
        this.ebookState.set('error');
      }
    }, 100);
  }
}