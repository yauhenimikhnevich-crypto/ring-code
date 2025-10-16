import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Sparkles } from 'lucide-react';
import { encodeText, renderRingCode, canvasToBlob, generateSVG, STYLES, StyleName } from '@/lib/ringcode';
import { toast } from 'sonner';

export function RingCodeGenerator() {
  const [text, setText] = useState('');
  const [style, setStyle] = useState<StyleName>('cyber');
  const [eccLevel, setEccLevel] = useState(2);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!text) return;
    
    try {
      setIsGenerating(true);
      const bits = encodeText(text, eccLevel);
      const canvas = renderRingCode(bits, 800, style);
      
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          canvasRef.current.width = 800;
          canvasRef.current.height = 800;
          ctx.drawImage(canvas, 0, 0);
        }
      }
      setIsGenerating(false);
    } catch (error) {
      console.error('Encoding error:', error);
      toast.error(error instanceof Error ? error.message : 'Ошибка кодирования');
      setIsGenerating(false);
    }
  }, [text, style, eccLevel]);

  const downloadPNG = async () => {
    if (!canvasRef.current || !text) return;
    
    try {
      const blob = await canvasToBlob(canvasRef.current);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ringcode-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('PNG сохранён');
      }
    } catch (error) {
      toast.error('Ошибка сохранения PNG');
    }
  };

  const downloadSVG = () => {
    if (!text) return;
    
    try {
      const bits = encodeText(text, eccLevel);
      const svg = generateSVG(bits, 1200, style);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ringcode-${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('SVG сохранён');
    } catch (error) {
      toast.error('Ошибка сохранения SVG');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Ваш текст
            </label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст для кодирования..."
              className="bg-secondary border-border text-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Стиль
              </label>
              <Select value={style} onValueChange={(v) => setStyle(v as StyleName)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STYLES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Уровень коррекции
              </label>
              <Select value={eccLevel.toString()} onValueChange={(v) => setEccLevel(parseInt(v))}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Низкий (8 байт)</SelectItem>
                  <SelectItem value="1">Средний (16 байт)</SelectItem>
                  <SelectItem value="2">Высокий (32 байт)</SelectItem>
                  <SelectItem value="3">Максимум (64 байт)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={downloadPNG}
              disabled={!text || isGenerating}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Download className="w-4 h-4 mr-2" />
              PNG
            </Button>
            <Button
              onClick={downloadSVG}
              disabled={!text || isGenerating}
              variant="secondary"
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              SVG
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Превью
          </h3>
        </div>
        
        <div className="relative aspect-square rounded-lg overflow-hidden bg-secondary/50 flex items-center justify-center">
          {text ? (
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-center text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Введите текст для генерации</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
