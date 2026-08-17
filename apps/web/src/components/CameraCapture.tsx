import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live camera capture.
 *
 * The stream is requested only while this component is mounted and is stopped
 * on every exit path — unmount, error, and after a shot is taken. A camera
 * light that stays on after you are done is both a privacy problem and a
 * broken promise.
 */

interface Props {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

export function CameraCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser has no camera API. Use “Choose a file” instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // The rear camera is the one pointed at the receipt.
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (caught) {
        const name = (caught as DOMException)?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera access was declined. You can still choose a file or type the expense in."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : "The camera could not be started.",
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  async function shoot() {
    const video = videoRef.current;
    if (!video || !ready) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return;

    stop();
    onCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="m-0 text-sm" style={{ color: "var(--status-serious)" }}>
          {error}
        </p>
        <button type="button" className="btn mt-3" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="relative bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="block max-h-[60vh] w-full object-contain"
        />
        {/* A framing guide meaningfully improves OCR — people centre the
            receipt when there is something to centre it in. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed opacity-40"
          style={{ borderColor: "#ffffff" }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 p-3">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={shoot} disabled={!ready}>
          {ready ? "Take photo" : "Starting camera…"}
        </button>
      </div>
    </div>
  );
}
