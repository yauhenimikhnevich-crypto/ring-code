import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RingCodeGenerator } from '@/components/RingCodeGenerator';
import { RingCodeDecoder } from '@/components/RingCodeDecoder';
import { InstallPWA } from '@/components/InstallPWA';
import { CircleDot, ScanLine } from 'lucide-react';

const Index = () => {
  const [activeTab, setActiveTab] = useState('generate');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center animate-pulse-glow">
                <CircleDot className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  RingCode
                </h1>
                <p className="text-xs text-muted-foreground">Генератор кольцевых кодов</p>
              </div>
            </div>
            <InstallPWA />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary">
            <TabsTrigger 
              value="generate"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <CircleDot className="w-4 h-4 mr-2" />
              Генерация
            </TabsTrigger>
            <TabsTrigger 
              value="decode"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <ScanLine className="w-4 h-4 mr-2" />
              Декодирование
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="mt-0">
            <RingCodeGenerator />
          </TabsContent>

          <TabsContent value="decode" className="mt-0">
            <RingCodeDecoder />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>RingCode v3.4 - Портировано с Python</p>
          <p className="mt-1">Поддерживает 12 стилей и Reed-Solomon коррекцию ошибок</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
