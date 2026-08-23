"use client";

import type { IScannerControls } from "@zxing/browser";
import { AlertCircle, LoaderCircle, ScanLine, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ScribbleButton } from "@/components/scribble-ui/button";
import {
  ScribbleDialog,
  ScribbleDialogClose,
  ScribbleDialogContent,
  ScribbleDialogDescription,
  ScribbleDialogHeader,
  ScribbleDialogTitle,
} from "@/components/scribble-ui/dialog";

type CameraErrorKey = "permissionDenied" | "noCamera" | "unsupported" | "cameraError";

type ScanBarcodeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanSuccess: (barcode: string) => void;
};

function getCameraErrorKey(error: unknown): CameraErrorKey {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "permissionDenied";
    }

    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "noCamera";
    }

    if (error.name === "NotSupportedError") {
      return "unsupported";
    }
  }

  return "cameraError";
}

function stopVideoStream(video: HTMLVideoElement | null) {
  if (video?.srcObject instanceof MediaStream) {
    video.srcObject.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

function stopMediaStream(stream: MediaStream | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function ScanBarcodeDialog({
  open,
  onOpenChange,
  onScanSuccess,
}: ScanBarcodeDialogProps) {
  const t = useTranslations("Scanner");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMounted, setVideoMounted] = useState(false);
  const [errorKey, setErrorKey] = useState<CameraErrorKey | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !videoMounted) {
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    let cancelled = false;
    let completed = false;
    let mediaStream: MediaStream | undefined;
    let scannerControls: IScannerControls | undefined;

    async function startScanner(videoElement: HTMLVideoElement) {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("Camera scanning is unavailable", "NotSupportedError");
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stopMediaStream(mediaStream);
          return;
        }

        videoElement.srcObject = mediaStream;
        await videoElement.play();

        const { BarcodeFormat, BrowserMultiFormatOneDReader } = await import(
          "@zxing/browser"
        );
        const reader = new BrowserMultiFormatOneDReader();

        reader.possibleFormats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ];

        const controls = await reader.decodeFromStream(
          mediaStream,
          videoElement,
          (result, _error, activeControls) => {
            if (!result || completed || cancelled) {
              return;
            }

            completed = true;
            activeControls.stop();
            onScanSuccess(result.getText());
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        scannerControls = controls;
        setIsStarting(false);
      } catch (error) {
        stopMediaStream(mediaStream);

        videoElement.srcObject = null;

        if (!cancelled) {
          setErrorKey(getCameraErrorKey(error));
          setIsStarting(false);
        }
      }
    }

    void startScanner(video);

    return () => {
      cancelled = true;
      scannerControls?.stop();
      stopVideoStream(video);
    };
  }, [attempt, onScanSuccess, open, videoMounted]);

  const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoMounted(Boolean(node));
  }, []);

  const status = errorKey ? "error" : isStarting ? "starting" : "scanning";

  return (
    <ScribbleDialog open={open} onOpenChange={onOpenChange}>
      <ScribbleDialogContent
        hideClose
        className="w-[calc(100%-var(--spacing-page-x)*2)] max-w-scanner-dialog bg-surface text-foreground shadow-raised"
      >
        <ScribbleDialogHeader className="flex-row items-start justify-between gap-control-gap text-left">
          <div className="min-w-0">
            <ScribbleDialogTitle className="text-foreground">
              {t("title")}
            </ScribbleDialogTitle>
            <ScribbleDialogDescription className="text-label text-foreground-muted">
              {t("description")}
            </ScribbleDialogDescription>
          </div>

          <ScribbleDialogClose asChild>
            <button
              type="button"
              className="focus-ring flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-control text-foreground-muted hover:text-foreground"
              aria-label={t("close")}
            >
              <X className="size-nav-icon" aria-hidden="true" />
            </button>
          </ScribbleDialogClose>
        </ScribbleDialogHeader>

        <div className="relative mt-copy-gap aspect-video overflow-hidden rounded-surface bg-foreground">
          <video
            ref={handleVideoRef}
            className="size-full object-cover"
            aria-label={t("cameraPreview")}
            autoPlay
            muted
            playsInline
          />
        </div>

        <div
          className={
            status === "error"
              ? "mt-control-gap flex min-h-touch items-start gap-control-gap rounded-control bg-danger-background p-control-x text-label text-danger-foreground"
              : "mt-control-gap flex min-h-touch items-center gap-control-gap text-label text-foreground-muted"
          }
          role={status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {status === "error" ? (
            <AlertCircle className="size-nav-icon shrink-0" aria-hidden="true" />
          ) : status === "starting" ? (
            <LoaderCircle
              className="size-nav-icon shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <ScanLine className="size-nav-icon shrink-0" aria-hidden="true" />
          )}
          <span>{errorKey ? t(errorKey) : t(status)}</span>
        </div>

        {errorKey && (
          <div className="mt-copy-gap flex justify-end">
            <ScribbleButton
              type="button"
              variant="outline"
              className="min-h-touch text-foreground"
              onClick={() => {
                setErrorKey(null);
                setIsStarting(true);
                setAttempt((current) => current + 1);
              }}
            >
              {t("retry")}
            </ScribbleButton>
          </div>
        )}
      </ScribbleDialogContent>
    </ScribbleDialog>
  );
}
