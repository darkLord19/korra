"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ExporterProfileWire } from "@korra/backend/schemas";
import { Alert, Badge, Button, Field, Input } from "../components";
import { useApi } from "../context";
import { toFormErrors, type FormErrors } from "../errors";

export interface SignaturePadProps {
  profile: ExporterProfileWire | null;
  onSaved?: () => void;
  /** Custom label for the save button, e.g. "Add signature → regenerate pack" */
  regenerateLabel?: string;
  onRegenerate?: () => void;
}

export function trimCanvas(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha && alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX === -1) return null;

  const pad = 10;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(width - cropX, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(height - cropY, maxY - minY + 1 + pad * 2);

  const trimmed = document.createElement("canvas");
  trimmed.width = cropW;
  trimmed.height = cropH;
  const tCtx = trimmed.getContext("2d");
  if (!tCtx) return null;
  tCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return trimmed.toDataURL("image/png");
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function trimImageFile(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const trimmed = trimCanvas(canvas);
      resolve(trimmed ?? dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function SignaturePad({ profile, onSaved, regenerateLabel, onRegenerate }: SignaturePadProps) {
  const api = useApi();
  const hasExisting = Boolean(profile?.signatureBlobKey);
  const [editing, setEditing] = useState(!hasExisting);
  const [mode, setMode] = useState<"draw" | "upload">("draw");

  const [signatoryName, setSignatoryName] = useState(profile?.signatoryName ?? profile?.legalName ?? "");
  const [signatoryDesignation, setSignatoryDesignation] = useState(profile?.signatoryDesignation ?? "Authorised Signatory");

  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedSig, setUploadedSig] = useState<string | null>(null);
  const [sealDataUrl, setSealDataUrl] = useState<string | null>(null);

  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, start] = useTransition();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const sigFileInputRef = useRef<HTMLInputElement | null>(null);
  const sealFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing || mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 400;
    const h = rect.height || 140;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
  }, [editing, mode]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointerId = (e as unknown as { pointerId?: number }).pointerId;
    if (pointerId !== undefined) {
      try {
        canvas.setPointerCapture(pointerId);
      } catch {
        // Synthetic or uncaptured pointer in headless / automated environments
      }
    }
    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPosRef.current = { x, y };
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(x, y, 1.25, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
    }
    setHasDrawn(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPosRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastPosRef.current = { x, y };
  };

  const onPointerUp = () => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleUploadSigChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const trimmed = await trimImageFile(file);
      setUploadedSig(trimmed);
      setErrors({});
    } catch {
      setErrors({ error: "Could not read signature image." });
    }
  };

  const handleUploadSealChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const trimmed = await trimImageFile(file);
      setSealDataUrl(trimmed);
      setErrors({});
    } catch {
      setErrors({ error: "Could not read seal image." });
    }
  };

  const handleSave = () => {
    setErrors({});
    start(async () => {
      let sigDataUrl: string | null = null;
      if (mode === "upload") {
        sigDataUrl = uploadedSig;
      } else {
        const canvas = canvasRef.current;
        if (canvas && hasDrawn) {
          sigDataUrl = trimCanvas(canvas);
        }
      }

      if (!sigDataUrl && !profile?.signatureBlobKey) {
        setErrors({ error: "Please draw your signature or upload an image." });
        return;
      }

      try {
        await api.saveSignature({
          signatoryName: signatoryName.trim() || undefined,
          signatoryDesignation: signatoryDesignation.trim() || undefined,
          signatureBase64: sigDataUrl ?? undefined,
          sealBase64: sealDataUrl ?? undefined,
        });
        setEditing(false);
        onSaved?.();
        onRegenerate?.();
      } catch (err) {
        setErrors(toFormErrors(err));
      }
    });
  };

  const handleRemove = () => {
    setErrors({});
    start(async () => {
      try {
        await api.clearSignature();
        setUploadedSig(null);
        setSealDataUrl(null);
        setHasDrawn(false);
        setEditing(true);
        onSaved?.();
      } catch (err) {
        setErrors(toFormErrors(err));
      }
    });
  };

  if (hasExisting && !editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Signature saved</span>
              <Badge tone="ok">Active</Badge>
            </div>
            <p className="text-sm text-ink">
              {profile?.signatoryName || "Authorised signatory"}
              {profile?.signatoryDesignation ? ` (${profile.signatoryDesignation})` : ""}
            </p>
            <p className="text-xs text-muted">
              This is an image of your signature, not a DSC. Banks that need a DSC-signed EDF will say so in the steps below.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {profile?.signatureUrl && (
              <img
                src={profile.signatureUrl}
                alt="Signature preview"
                className="h-12 max-w-32 rounded border border-line bg-surface p-1 object-contain"
              />
            )}
            {profile?.sealUrl && (
              <img
                src={profile.sealUrl}
                alt="Seal preview"
                className="h-12 max-w-20 rounded border border-line bg-surface p-1 object-contain"
              />
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Change signature
              </Button>
              <Button variant="danger" size="sm" disabled={pending} onClick={handleRemove}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errors.error && <Alert tone="danger">{errors.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sig-name" label="Authorised signatory name" hint="Printed below the signature on the EDF.">
          <Input
            id="sig-name"
            value={signatoryName}
            onChange={(e) => setSignatoryName(e.target.value)}
            placeholder="e.g. Jane Dev"
          />
        </Field>
        <Field id="sig-desig" label="Designation" hint="e.g. Director, Partner, Proprietor.">
          <Input
            id="sig-desig"
            value={signatoryDesignation}
            onChange={(e) => setSignatoryDesignation(e.target.value)}
            placeholder="e.g. Director"
          />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            {mode === "draw" ? "Draw your signature" : "Upload signature image"}
          </label>
          <div className="flex gap-2">
            {mode === "draw" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode("upload");
                  clearCanvas();
                }}
              >
                Upload an image instead
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode("draw");
                  setUploadedSig(null);
                }}
              >
                Draw on screen instead
              </Button>
            )}
          </div>
        </div>

        {mode === "draw" ? (
          <div className="space-y-2">
            <div className="relative rounded-lg border border-line bg-surface overflow-hidden">
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onMouseDown={onPointerDown}
                onMouseMove={onPointerMove}
                onMouseUp={onPointerUp}
                className="h-36 w-full touch-none cursor-crosshair bg-surface"
              />
              {!hasDrawn && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
                  Sign inside this box using mouse, pen, or touch
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={clearCanvas} disabled={!hasDrawn}>
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface p-4 text-center">
            <input
              ref={sigFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleUploadSigChange}
              className="hidden"
            />
            {uploadedSig ? (
              <div className="space-y-2">
                <img
                  src={uploadedSig}
                  alt="Uploaded signature"
                  className="mx-auto h-24 max-w-xs rounded border border-line p-1 object-contain"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => sigFileInputRef.current?.click()}
                >
                  Choose another image
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => sigFileInputRef.current?.click()}
              >
                Choose PNG or JPEG image
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Company seal / stamp (optional)</label>
          {sealDataUrl && (
            <Button variant="ghost" size="sm" onClick={() => setSealDataUrl(null)}>
              Remove seal
            </Button>
          )}
        </div>
        <input
          ref={sealFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleUploadSealChange}
          className="hidden"
        />
        {sealDataUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={sealDataUrl}
              alt="Seal preview"
              className="h-16 w-16 rounded border border-line p-1 object-contain"
            />
            <Button variant="secondary" size="sm" onClick={() => sealFileInputRef.current?.click()}>
              Replace seal
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => sealFileInputRef.current?.click()}>
            Upload seal or stamp image
          </Button>
        )}
      </div>

      <p className="text-xs text-muted">
        This is an image of your signature, not a DSC. Banks that need a DSC-signed EDF will say so in the steps below.
      </p>

      <div className="flex items-center justify-end gap-2 pt-2">
        {hasExisting && (
          <Button variant="secondary" size="md" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button variant="primary" size="md" onClick={handleSave} disabled={pending}>
          {pending ? "Saving..." : (regenerateLabel ?? "Save signature")}
        </Button>
      </div>
    </div>
  );
}
