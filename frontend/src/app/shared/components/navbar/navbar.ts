import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.html'
})
export class Navbar implements AfterViewInit, OnDestroy {
  @ViewChild('navbar') private navbar?: ElementRef<HTMLElement>;

  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private animationContext?: { revert: () => void };
  private destroyed = false;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || !this.navbar) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      void this.animateEntrance();
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.animationContext?.revert();
  }

  private async animateEntrance(): Promise<void> {
    const { gsap } = await import('gsap');

    if (this.destroyed || !this.navbar) {
      return;
    }

    this.animationContext = gsap.context(() => {
      gsap.from(this.navbar!.nativeElement, {
        autoAlpha: 0,
        duration: 0.7,
        ease: 'power3.out',
        y: -12
      });
    }, this.navbar.nativeElement);
  }
}
