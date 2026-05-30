import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  PlatformFeature,
  PlatformFeatureCard,
} from '../../components/platform-feature-card/platform-feature-card';
import { Navbar } from '../../../../shared/components/navbar/navbar';

@Component({
  selector: 'app-home-page',
  imports: [Navbar, RouterLink, PlatformFeatureCard],
  templateUrl: './home-page.html',
})
export class HomePage implements AfterViewInit, OnDestroy {
  protected readonly platformFeatures: readonly PlatformFeature[] = [
    {
      title: 'Integração de Algoritmos',
      description:
        'Arquitetura extensível para integração de algoritmos externos com saída padronizada.',
      icon: 'workflow',
      cardColor: '#F7FAFC',
      iconColor: '#1B3A57',
    iconBackgroundColor: '#EAF2F8',
    },
    {
      title: 'Visualização Multimodal',
      description: 'Sobreposição de imagens térmicas e ópticas com controle de opacidade.',
      icon: 'layers',
      cardColor: '#F7FAFC',
      iconColor: '#246BA8',
    iconBackgroundColor: '#E5F1FA',
    },
    {
      title: 'Regiões de Interesse',
      description: 'Definição e manipulação de ROIs para extração de métricas por articulação.',
      icon: 'target',
      cardColor: '#F7FAFC',
      iconColor: '#32B5FE',
    iconBackgroundColor: '#E5F8FF',
    },
    {
      title: 'Evolução Temporal',
      description:
        'Histórico de exames por paciente e evolução de índices clínicos ao longo do tempo.',
      icon: 'timeline',
      cardColor: '#F7FAFC',
      iconColor: '#4A91C7',
    iconBackgroundColor: '#E8F4FB',
    },
    {
      title: 'Métricas Quantitativas',
      description: 'Cálculo automatizado de CDAI e DAS28 a partir dos dados do exame.',
      icon: 'chart',
      cardColor: '#F7FAFC',
      iconColor: '#68A9D6',
    iconBackgroundColor: '#EDF7FC',
    },
  ];

  @ViewChild('heroSection') private heroSection?: ElementRef<HTMLElement>;
  @ViewChild('heroBackground') private heroBackground?: ElementRef<HTMLImageElement>;
  @ViewChild('heroContent') private heroContent?: ElementRef<HTMLElement>;

  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private animationContext?: { revert: () => void };
  private destroyed = false;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || !this.heroSection || !this.heroBackground) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      void this.setupHeroScrollAnimation();
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.animationContext?.revert();
  }

  private async setupHeroScrollAnimation(): Promise<void> {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ]);

    if (this.destroyed || !this.heroSection || !this.heroBackground || !this.heroContent) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const section = this.heroSection.nativeElement;
    const background = this.heroBackground.nativeElement;
    const content = this.heroContent.nativeElement;

    this.animationContext = gsap.context(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.set(background, {
        force3D: true,
        scale: 1,
        transformOrigin: '50% 50%',
      });

      if (reducedMotion) {
        return;
      }

      gsap
        .timeline({
          defaults: {
            ease: 'none',
          },
          scrollTrigger: {
            trigger: document.documentElement,
            start: 'top top',
            end: () => `+=${ScrollTrigger.maxScroll(window)}`,
            scrub: 1.05,
            invalidateOnRefresh: true,
          },
        })
        .to(
          background,
          {
            scale: 1.4,
          },
          0,
        );

      gsap.from(content, {
        autoAlpha: 0,
        duration: 0.8,
        ease: 'power3.out',
        y: 14,
      });

      if (!background.complete) {
        background.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
      }
    }, section);
  }
}
