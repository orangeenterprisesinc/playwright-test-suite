import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';

// Synthetic stand-ins for a reader's enrollment: no real biometric template or face photo lives in the repo.

export function randomTemplate(bytes: number): string {
    return randomBytes(bytes).toString('base64');
}

/** A gradient and an ellipse drawn on a canvas; JPEG base64 without the data-URL prefix. */
export async function syntheticPortraitJpeg(page: Page, width: number, height: number): Promise<string> {
    return page.evaluate(({ w, h }) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas 2d context unavailable');
        const hue = Math.floor(Math.random() * 360);
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, `hsl(${hue}, 60%, 70%)`);
        gradient.addColorStop(1, `hsl(${(hue + 90) % 360}, 60%, 40%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = `hsl(${(hue + 180) % 360}, 50%, 85%)`;
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.45, w * 0.25, h * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        return canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, '');
    }, { w: width, h: height });
}
