import { Suspense, useEffect, useRef, useState } from "react";
export default function LazySection({ component: Component, fallback, sectionId, ...props }) {
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "300px",
        threshold: 0,
      }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div id={sectionId} ref={sectionRef} data-lazy-section={sectionId} style={{ scrollMarginTop: "24px" }}>
      {isVisible ? (
        <Suspense fallback={<div className="section-block">{fallback}</div>}>
          <Component {...props} />
        </Suspense>
      ) : (
        <div className="section-block" style={{ minHeight: 180 }}>
          {fallback}
        </div>
      )}
    </div>
  );
}
