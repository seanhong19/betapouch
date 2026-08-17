import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
export function CameraCapture({ onCapture, onCancel }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [error, setError] = useState(null);
    const [ready, setReady] = useState(false);
    const stop = useCallback(() => {
        for (const track of streamRef.current?.getTracks() ?? [])
            track.stop();
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
                    for (const track of stream.getTracks())
                        track.stop();
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    setReady(true);
                }
            }
            catch (caught) {
                const name = caught?.name;
                setError(name === "NotAllowedError"
                    ? "Camera access was declined. You can still choose a file or type the expense in."
                    : name === "NotFoundError"
                        ? "No camera was found on this device."
                        : "The camera could not be started.");
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
        if (!video || !ready)
            return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context)
            return;
        context.drawImage(video, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
        canvas.width = 0;
        canvas.height = 0;
        if (!blob)
            return;
        stop();
        onCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }
    if (error) {
        return (_jsxs("div", { className: "card p-4", children: [_jsx("p", { className: "m-0 text-sm", style: { color: "var(--status-serious)" }, children: error }), _jsx("button", { type: "button", className: "btn mt-3", onClick: onCancel, children: "Back" })] }));
    }
    return (_jsxs("div", { className: "card overflow-hidden", children: [_jsxs("div", { className: "relative bg-black", children: [_jsx("video", { ref: videoRef, playsInline: true, muted: true, className: "block max-h-[60vh] w-full object-contain" }), _jsx("div", { "aria-hidden": "true", className: "pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed opacity-40", style: { borderColor: "#ffffff" } })] }), _jsxs("div", { className: "flex items-center justify-between gap-3 p-3", children: [_jsx("button", { type: "button", className: "btn", onClick: onCancel, children: "Cancel" }), _jsx("button", { type: "button", className: "btn btn-primary", onClick: shoot, disabled: !ready, children: ready ? "Take photo" : "Starting camera…" })] })] }));
}
