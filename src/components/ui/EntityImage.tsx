import { useState } from "react";

interface EntityImageProps {
  src: string | null;
  fallback: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  rounded?: boolean;
}

/**
 * Image with graceful fallback to emoji/text if asset is missing or fails to load.
 */
export function EntityImage({
  src,
  fallback,
  alt,
  className = "",
  imgClassName = "",
  rounded = false,
}: EntityImageProps) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  if (showImage) {
    return (
      <div className={`entity-image-wrapper ${className}`}>
        <img
          src={src}
          alt={alt}
          className={`entity-img ${imgClassName} ${rounded ? "rounded-lg" : ""}`}
          onError={() => setErrored(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className={`entity-image-fallback ${className}`}>
      <span className="entity-fallback-text">{fallback}</span>
    </div>
  );
}
