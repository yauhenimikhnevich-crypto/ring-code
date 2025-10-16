import { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

export function RingCodeDecoder() {
  const [image, setImage] = useState<string | null>(null);
  const [decodedText, setDecodedText] = useState<string>('');
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodingProgress, setDecodingProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImage(dataUrl);
      decodeImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (error) {
      toast.error('Не удалось получить доступ к камере');
      console.error('Camera error:', error);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      setImage(dataUrl);
      decodeImage(dataUrl);
      stopCamera();
    }
  };

  const decodeImage = async (dataUrl: string) => {
    setIsDecoding(true);
    setDecodingProgress(0);
    
    try {
      const { decodeRingCodeFromDataURL } = await import('@/lib/ringcode-decoder');
      const result = await decodeRingCodeFromDataURL(dataUrl, (progress) => {
        setDecodingProgress(progress);
      });
      
      if (result) {
        setDecodedText(result);
        toast.success('Код успешно декодирован!');
      } else {
        setDecodedText('Не удалось декодировать изображение. Убедитесь, что это валидный RingCode.');
        toast.error('Декодирование не удалось');
      }
    } catch (error) {
      console.error('Decoding error:', error);
      setDecodedText('Ошибка декодирования. Проверьте качество изображения.');
      toast.error('Ошибка декодирования');
    } finally {
      setIsDecoding(false);
      setDecodingProgress(0);
    }
  };

  const clearImage = () => {
    setImage(null);
    setDecodedText('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              <Upload className="w-4 h-4 mr-2" />
              Загрузить
            </Button>
            <Button
              onClick={isCameraActive ? captureFromCamera : startCamera}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Camera className="w-4 h-4 mr-2" />
              {isCameraActive ? 'Снять фото' : 'Камера'}
            </Button>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </Card>

      {isCameraActive && (
        <Card className="p-6 bg-card border-border shadow-card relative">
          <Button
            onClick={stopCamera}
            size="icon"
            variant="secondary"
            className="absolute top-4 right-4 z-10"
          >
            <X className="w-4 h-4" />
          </Button>
          <video
            ref={videoRef}
            className="w-full rounded-lg"
            autoPlay
            playsInline
          />
        </Card>
      )}

      {image && !isCameraActive && (
        <Card className="p-6 bg-card border-border shadow-card">
          <div className="relative">
            <Button
              onClick={clearImage}
              size="icon"
              variant="secondary"
              className="absolute top-2 right-2 z-10"
            >
              <X className="w-4 h-4" />
            </Button>
            <img
              src={image}
              alt="Uploaded"
              className="w-full rounded-lg"
            />
          </div>

          {decodedText && (
            <div className="mt-4 p-4 bg-secondary rounded-lg">
              <p className="text-sm font-medium text-muted-foreground mb-2">Декодированный текст:</p>
              <p className="text-foreground break-words">{decodedText}</p>
            </div>
          )}
          
          {isDecoding && (
            <div className="mt-4 p-4 bg-secondary rounded-lg">
              <p className="text-sm font-medium text-muted-foreground mb-2">Декодирование...</p>
              <div className="w-full bg-primary/20 rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${decodingProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">{Math.round(decodingProgress)}%</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
