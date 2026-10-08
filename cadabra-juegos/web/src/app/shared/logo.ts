import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { environment } from '../../environments/environment';

/** El logo de Cadabra (el del inicio del sitio) sobre una placa crema: sus letras en morado oscuro no se verían sobre el morado del encabezado. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!roto()) {
      <a class="logo" [href]="marca.sitioUrl" aria-label="Cadabra, ir al inicio">
        <img [src]="marca.logoUrl" alt="Cadabra" (error)="roto.set(true)" />
      </a>
    } @else {
      <p class="texto">Cadabra</p>
    }
  `,
  styles: `
    :host { display: block; margin-bottom: 14px; }
    .logo { display: inline-block; padding: 8px 16px; border-radius: 14px; background: #faf0e1; line-height: 0; }
    .logo img { display: block; height: 40px; width: auto; }
    .texto { margin: 0; font-family: var(--display); font-weight: 700; color: var(--tapete-tenue); }
  `,
})
export class Logo {
  protected readonly marca = environment.marca;
  protected readonly roto = signal(false);
}
