import { Children, createContext, CSSProperties, ReactNode, useContext, useEffect, useState } from 'react';

type CarouselContextValue = {
  index: number;
  count: number;
  setIndex: (next: number) => void;
  setCount: (next: number) => void;
};

const CarouselContext = createContext<CarouselContextValue | null>(null);

const useCarousel = () => {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('Carousel components must be used inside <Carousel>.');
  return ctx;
};

export const Carousel = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => {
  const [index, setIndexState] = useState(0);
  const [count, setCountState] = useState(0);
  const setIndex = (next: number) => {
    if (!count) return;
    if (next < 0) return setIndexState(0);
    if (next >= count) return setIndexState(count - 1);
    setIndexState(next);
  };
  const setCount = (next: number) => {
    const safe = Math.max(0, Number(next || 0));
    setCountState(safe);
    setIndexState((current) => {
      if (!safe) return 0;
      return Math.min(current, safe - 1);
    });
  };
  return (
    <CarouselContext.Provider value={{ index, count, setIndex, setCount }}>
      <div className={className} style={style} data-carousel-root>
        {children}
      </div>
    </CarouselContext.Provider>
  );
};

export const CarouselContent = ({ children, className }: { children: ReactNode; className?: string }) => {
  const { index, setCount } = useCarousel();
  const items = Children.toArray(children);
  useEffect(() => {
    setCount(items.length);
  }, [items.length, setCount]);
  return (
    <div className={className} style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          transition: 'transform 240ms ease',
          transform: `translateX(-${index * 100}%)`,
        }}
      >
        {items.map((child, idx) => (
          <div key={idx} style={{ minWidth: '100%' }}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
};

export const CarouselItem = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={className} data-carousel-item>
    {children}
  </div>
);

export const CarouselPrevious = ({ className }: { className?: string }) => {
  const { index, setIndex } = useCarousel();
  return (
    <button type="button" className={className} onClick={() => setIndex(index - 1)} disabled={index <= 0}>
      Precedent
    </button>
  );
};

export const CarouselNext = ({ className }: { className?: string }) => {
  const { index, count, setIndex } = useCarousel();
  return (
    <button type="button" className={className} onClick={() => setIndex(index + 1)} disabled={index >= count - 1}>
      Suivant
    </button>
  );
};
