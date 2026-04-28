import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Photo } from '../../../core/models/photo.model';
import { PhotoService } from '../../../core/services/foto.service';

const MINIMAP_W = 160;

@Component({
  selector: 'app-feed',
  imports: [],
  templateUrl: './feed.html',
  styleUrl: './feed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Feed {
  private photoService = inject(PhotoService);

  // Feed state
  photos = signal<Photo[]>([]);
  uploading = signal(false);
  error = signal<string | null>(null);

  // Lightbox state
  focusedPhoto = signal<Photo | null>(null);

  // Zoom / pan state
  zoomed = signal(false);
  zoomScale = signal(2);        // user-controlled, 2–10
  editingScale = signal(false); // inline edit mode for the scale label
  panX = signal(0);
  panY = signal(0);

  // Displayed dimensions of the lightbox image (set on image load)
  private imgW = signal(0);
  private imgH = signal(0);

  // Drag tracking (plain booleans — no need for signals)
  private isDragging = false;
  private dragLastX = 0;
  private dragLastY = 0;

  // CSS transform string — recomputes whenever scale or pan changes
  imgTransform = computed(() =>
    this.zoomed()
      ? `translate(${this.panX()}px,${this.panY()}px) scale(${this.zoomScale()})`
      : 'none'
  );

  // Minimap rect — recomputes whenever zoom, pan, scale, or image size changes
  minimapData = computed(() => {
    const S = this.zoomScale();
    const W = this.imgW();
    const H = this.imgH();
    if (!this.zoomed() || W === 0 || H === 0) return null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const px = this.panX();
    const py = this.panY();

    // At scale(S) + translate(px,py) with transform-origin center:
    // Left edge of scaled image in screen coords:
    const imgLeft = vw / 2 + px - (S / 2) * W;
    const imgTop  = vh / 2 + py - (S / 2) * H;

    // Visible fraction of the full S× image [0..1]
    const normLeft  = Math.max(0, -imgLeft / (W * S));
    const normTop   = Math.max(0, -imgTop  / (H * S));
    const normRight = Math.min(1, (vw - imgLeft) / (W * S));
    const normBot   = Math.min(1, (vh - imgTop)  / (H * S));

    const miniH = MINIMAP_W * (H / W);

    return {
      w: MINIMAP_W,
      h: miniH,
      rectLeft:   normLeft              * MINIMAP_W,
      rectTop:    normTop               * miniH,
      rectWidth:  (normRight - normLeft) * MINIMAP_W,
      rectHeight: (normBot   - normTop)  * miniH,
    };
  });

  constructor() {
    afterNextRender(() => this.loadPhotos());
  }

  // ── Lightbox controls ────────────────────────────────────────────────────────

  openModal(photo: Photo) {
    this.focusedPhoto.set(photo);
    this.resetZoom();
  }

  @HostListener('document:keydown.escape')
  closeModal() {
    this.focusedPhoto.set(null);
    this.resetZoom();
  }

  toggleZoom() {
    this.zoomed.update(z => !z);
    this.panX.set(0);
    this.panY.set(0);
  }

  onZoomScaleChange(event: Event) {
    const scale = +(event.target as HTMLInputElement).value;
    this.applyScale(scale);
  }

  @HostListener('document:wheel', ['$event'])
  onDocWheel(event: WheelEvent) {
    if (!this.zoomed() || !this.focusedPhoto()) return;
    const direction = event.deltaY > 0 ? -1 : 1;
    const next = Math.max(2, Math.min(100, this.zoomScale() + direction));
    // Pass cursor coords so the pixel under the cursor stays fixed after scaling
    this.applyScale(next, event.clientX, event.clientY);
  }

  onScaleInputCommit(event: Event) {
    const raw = +(event.target as HTMLInputElement).value;
    const clamped = Math.max(2, Math.min(10, Math.round(raw)));
    if (!isNaN(clamped)) this.applyScale(clamped);
    this.editingScale.set(false);
  }

  /**
   * Apply a new zoom scale.
   * When cursorX/Y are provided (scroll), the image point under the cursor
   * stays fixed — zoom-to-cursor behaviour.
   * When omitted (slider, typed input), zooms toward the viewport center.
   */
  private applyScale(scale: number, cursorX?: number, cursorY?: number) {
    const oldScale = this.zoomScale();
    const newScale = scale;
    const ratio    = newScale / oldScale;

    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    const maxX = (newScale / 2) * this.imgW();
    const maxY = (newScale / 2) * this.imgH();

    // Use cursor when provided, otherwise zoom from viewport center
    const cx = cursorX ?? vw / 2;
    const cy = cursorY ?? vh / 2;

    // Offset the pan so the image point under (cx, cy) stays at (cx, cy)
    const newPanX = (cx - vw / 2) * (1 - ratio) + this.panX() * ratio;
    const newPanY = (cy - vh / 2) * (1 - ratio) + this.panY() * ratio;

    this.zoomScale.set(newScale);
    this.panX.set(Math.max(-maxX, Math.min(maxX, newPanX)));
    this.panY.set(Math.max(-maxY, Math.min(maxY, newPanY)));
  }

  onLightboxImgLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    this.imgW.set(img.offsetWidth);
    this.imgH.set(img.offsetHeight);
  }

  // ── Drag to pan ──────────────────────────────────────────────────────────────

  onImgMouseDown(event: MouseEvent) {
    if (!this.zoomed()) return;
    this.isDragging = true;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onDocMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;
    const dx = event.clientX - this.dragLastX;
    const dy = event.clientY - this.dragLastY;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
    const maxX = (this.zoomScale() / 2) * this.imgW();
    const maxY = (this.zoomScale() / 2) * this.imgH();
    this.panX.update(x => Math.max(-maxX, Math.min(maxX, x + dx)));
    this.panY.update(y => Math.max(-maxY, Math.min(maxY, y + dy)));
  }

  @HostListener('document:mouseup')
  onDocMouseUp() {
    this.isDragging = false;
  }

  // ── Feed ─────────────────────────────────────────────────────────────────────

  private async loadPhotos() {
    try {
      const result = await this.photoService.getAll();
      this.photos.set(result);
    } catch {
      this.error.set('Could not load photos.');
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    this.uploading.set(true);
    this.error.set(null);
    try {
      // Upload all files concurrently
      const uploaded = await Promise.all(files.map(f => this.photoService.Upload(f)));
      this.photos.update(current => [...uploaded.reverse(), ...current]);
    } catch {
      this.error.set('One or more uploads failed. Please try again.');
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  private resetZoom() {
    this.zoomed.set(false);
    this.zoomScale.set(2);
    this.editingScale.set(false);
    this.panX.set(0);
    this.panY.set(0);
  }
}
