import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as React from "react"
import { useEffect, useRef, useState } from "react"
import rough from "roughjs"

import { ScribbleDivider } from "./decorative/divider"
import { ScribbleClose } from "./icons/close"
import { cn } from "./lib/utils"

// =============================================================================
// DIALOG ROOT
// =============================================================================

const ScribbleDialog = DialogPrimitive.Root

// =============================================================================
// DIALOG TRIGGER
// =============================================================================

const ScribbleDialogTrigger = DialogPrimitive.Trigger

// =============================================================================
// DIALOG PORTAL
// =============================================================================

const ScribbleDialogPortal = DialogPrimitive.Portal

// =============================================================================
// DIALOG CLOSE
// =============================================================================

const ScribbleDialogClose = DialogPrimitive.Close

// =============================================================================
// DIALOG OVERLAY
// =============================================================================

const ScribbleDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
ScribbleDialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// =============================================================================
// DIALOG CONTENT
// =============================================================================

interface ScribbleDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Hide close button */
  hideClose?: boolean
}

const ScribbleDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ScribbleDialogContentProps
>(({ className, children, hideClose = false, ...props }, ref) => {
  const svgRef = useRef<SVGSVGElement>(null)
  // Callback state: Radix unmounts Content while closed, so []-effect misses the node
  const [frameNode, setFrameNode] = useState<HTMLDivElement | null>(null)
  const [dims, setDims] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!frameNode) return

    const measure = () => {
      // offset* ignores parent zoom transform (unlike getBoundingClientRect)
      setDims({
        width: frameNode.offsetWidth,
        height: frameNode.offsetHeight,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frameNode)
    return () => observer.disconnect()
  }, [frameNode])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || dims.width === 0) return

    svg.setAttribute("width", String(dims.width))
    svg.setAttribute("height", String(dims.height))
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const rc = rough.svg(svg)
    const strokeColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--scribble-stroke")
        .trim() || "#1a1a1a"

    svg.appendChild(
      rc.rectangle(2, 2, dims.width - 4, dims.height - 4, {
        roughness: 1.2,
        stroke: strokeColor,
        strokeWidth: 2,
        seed: 42,
      }),
    )
  }, [dims])

  return (
    <ScribbleDialogPortal>
      <ScribbleDialogOverlay />
      <DialogPrimitive.Content
        ref={(node) => {
          // Forward ref
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
          "bg-[#fffef8] dark:bg-gray-900 shadow-xl",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "duration-200",
          "focus:outline-none",
          className
        )}
        {...props}
      >
        {/* Outer frame - non-scrolling, holds the border */}
        <div ref={setFrameNode} className="relative w-full">
          {/* Sketchy border - fixed to outer frame, doesn't scroll */}
          <svg
            ref={svgRef}
            className="pointer-events-none absolute left-0 top-0 z-30"
            style={{ overflow: "visible" }}
          />

          {/* Close button - on frame, above border */}
          {!hideClose && (
            <DialogPrimitive.Close
              className="absolute right-2 top-2 z-40 p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
              aria-label="Close"
            >
              <ScribbleClose size={20} />
            </DialogPrimitive.Close>
          )}

          {/* Scrollable content area */}
          <div className="w-full max-h-[85vh] overflow-y-auto p-6">
            {children}
          </div>
        </div>
      </DialogPrimitive.Content>
    </ScribbleDialogPortal>
  )
})
ScribbleDialogContent.displayName = DialogPrimitive.Content.displayName

// =============================================================================
// DIALOG HEADER
// =============================================================================

const ScribbleDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
)
ScribbleDialogHeader.displayName = "ScribbleDialogHeader"

// =============================================================================
// DIALOG FOOTER
// =============================================================================

const ScribbleDialogFooter = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="mt-6">
    {/* Thin scribble separator */}
    <ScribbleDivider variant="line" color="muted" />
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  </div>
)
ScribbleDialogFooter.displayName = "ScribbleDialogFooter"

// =============================================================================
// DIALOG TITLE
// =============================================================================

const ScribbleDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-none tracking-tight text-gray-900 dark:text-gray-100",
      className
    )}
    style={{ fontFamily: "var(--font-handwriting)" }}
    {...props}
  />
))
ScribbleDialogTitle.displayName = DialogPrimitive.Title.displayName

// =============================================================================
// DIALOG DESCRIPTION
// =============================================================================

const ScribbleDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-gray-600 dark:text-gray-400 mt-2", className)}
    {...props}
  />
))
ScribbleDialogDescription.displayName = DialogPrimitive.Description.displayName

// =============================================================================
// EXPORTS
// =============================================================================

export {
  ScribbleDialog,
  ScribbleDialogPortal,
  ScribbleDialogOverlay,
  ScribbleDialogClose,
  ScribbleDialogTrigger,
  ScribbleDialogContent,
  ScribbleDialogHeader,
  ScribbleDialogFooter,
  ScribbleDialogTitle,
  ScribbleDialogDescription,
}
