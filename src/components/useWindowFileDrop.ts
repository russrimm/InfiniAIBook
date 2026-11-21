"use client";

import { useEffect, useRef, useState } from "react";

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

/**
 * Accept files dropped anywhere on the page.
 *
 * Without this, a file dropped outside the small upload zone makes the browser
 * open it in this tab and leave the notebook. Only drags that start outside
 * the page count (a picture dragged from the page also reports "Files"), and a
 * drop that a drop zone already handled (it called preventDefault) is left to
 * that zone. While a dialog is open the drop is swallowed, so the page is not
 * left, but nothing is added behind it.
 *
 * Returns whether a file is currently being dragged over the page.
 */
export function useWindowFileDrop(onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onFiles);
  useEffect(() => {
    latest.current = onFiles;
  });

  useEffect(() => {
    let depth = 0;
    let internal = false;

    const start = () => {
      internal = true;
    };
    const end = () => {
      internal = false;
      depth = 0;
      setDragging(false);
    };
    const enter = (e: DragEvent) => {
      if (internal || !hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (internal || !hasFiles(e)) return;
      // Marking the page a valid target is what stops the browser opening the file.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (internal || !hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (internal || !hasFiles(e)) return;
      depth = 0;
      setDragging(false);
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) latest.current(files);
    };

    window.addEventListener("dragstart", start);
    window.addEventListener("dragend", end);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", end);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return dragging;
}
