export interface SampleInspectionImage {
  id: string;
  fileName: string;
  title: string;
  description: string;
  dataUrl: string;
}

function createConveyorSample(kind: 'mixed' | 'hazard' | 'composite'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Matte dark conveyor belt surface
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, 800, 600);

  // Subtle conveyor belt ribs
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  for (let x = 40; x < 800; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 600);
    ctx.stroke();
  }

  if (kind === 'mixed') {
    // 1. Clear PET Bottle
    ctx.fillStyle = 'rgba(186, 230, 253, 0.72)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(75, 85, 145, 220, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(120, 58, 55, 28);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(85, 165, 125, 58);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('PET #1 WATER', 98, 198);

    // 2. Crushed Aluminum Can
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.roundRect(320, 100, 145, 165, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(330, 145, 125, 65);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('ALU CAN 330ml', 342, 182);

    // 3. Corrugated Cardboard Box
    ctx.fillStyle = '#b48a5a';
    ctx.strokeStyle = '#785634';
    ctx.fillRect(110, 355, 320, 180);
    ctx.strokeRect(110, 355, 320, 180);
    ctx.fillStyle = '#451a03';
    ctx.fillText('CORRUGATED OCC BOX (DRY)', 165, 448);

    // 4. Green Glass Jar
    ctx.fillStyle = 'rgba(22, 163, 74, 0.75)';
    ctx.strokeStyle = '#4ade80';
    ctx.beginPath();
    ctx.roundRect(535, 220, 175, 230, 28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('GREEN GLASS', 575, 340);
  } else if (kind === 'hazard') {
    // 1. Swollen Li-ion Battery Pack
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.fillRect(105, 105, 250, 185);
    ctx.strokeRect(105, 105, 250, 185);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(120, 120, 38, 22);
    ctx.fillRect(175, 120, 38, 22);
    ctx.fillStyle = '#fef2f2';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('LI-ION BATTERY 3.8V', 135, 200);
    ctx.fillStyle = '#f87171';
    ctx.font = '13px sans-serif';
    ctx.fillText('WARNING: SWOLLEN CELL', 142, 230);

    // 2. Chemical Solvent Bottle
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#f59e0b';
    ctx.fillRect(460, 80, 180, 210);
    ctx.strokeRect(460, 80, 180, 210);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(550, 125);
    ctx.lineTo(590, 185);
    ctx.lineTo(510, 185);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('SOLVENT / HAZARD', 485, 225);

    // 3. Greasy Food-Soiled Takeout Box
    ctx.fillStyle = '#c29b6c';
    ctx.fillRect(365, 330, 335, 210);
    ctx.fillStyle = 'rgba(120, 53, 15, 0.55)';
    ctx.beginPath();
    ctx.ellipse(520, 440, 110, 62, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('FOOD GREASE RESIDUE', 435, 445);
  } else {
    // 1. Multi-layer Foil Snack Pouch
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.fillRect(95, 95, 260, 210);
    ctx.strokeRect(95, 95, 260, 210);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('MULTI-LAYER FOIL POUCH', 120, 200);

    // 2. Denim Textile Scrap
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(410, 300, 290, 220);
    ctx.strokeStyle = '#60a5fa';
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(420, 310, 270, 200);
    ctx.setLineDash([]);
    ctx.fillStyle = '#eff6ff';
    ctx.fillText('DENIM TEXTILE SCRAP', 465, 415);

    // 3. Coffee Cup + Plastic Lid
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(540, 175, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.fillText('POLY-COATED CUP', 475, 180);
  }

  return canvas.toDataURL('image/png');
}

export function generateSampleInspectionImages(): SampleInspectionImage[] {
  return [
    {
      id: 'sample_mixed',
      fileName: 'sample_mixed_recyclables.png',
      title: 'Mixed Dry Recyclables Belt',
      description: 'Clear PET #1 bottle, crushed aluminum can, dry OCC box, and green glass jar.',
      dataUrl: createConveyorSample('mixed'),
    },
    {
      id: 'sample_hazard',
      fileName: 'sample_hazard_battery_contamination.png',
      title: 'Hazard & Food Residue Frame',
      description: 'Swollen Li-ion battery cell, solvent container, and grease-stained fiber takeout.',
      dataUrl: createConveyorSample('hazard'),
    },
    {
      id: 'sample_composite',
      fileName: 'sample_textile_composite.png',
      title: 'Composite & Textile Stream',
      description: 'Multi-layer foil pouch, denim textile scrap, and poly-coated cup.',
      dataUrl: createConveyorSample('composite'),
    },
  ];
}
