import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { User } from 'lucide-react';
import { CreationSuccessModal } from './success-modal';
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from '@/components/ui/shadcn-io/dropzone';

/**
 * This is a "New AI Character" page component.
 * It includes the main interface layout.
 */
export default function CharacterCreatorPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const characterDescription = "他看上去约莫二十五六岁，身形清瘦如冬日枯枝。总在图书馆旧书区消磨时间的...（此处省略）...但他若有若无的面部轮廓堪称古典——额头饱满，鼻梁挺拔如希腊雕塑，但真正让人过目不忘的，是那双隐藏在无框眼镜后的眼睛。";
  const generatedImageUrl = "https://placehold.co/400x600/334155/e2e8f0?text=AI+Character"; // Placeholder for the generated image in the modal

  return (
    // Assuming your root layout has the 'dark' class enabled
    // We use shadcn/ui semantic colors like bg-background and text-foreground
    <div className="flex w-full min-h-screen p-8 bg-background text-foreground">
      
      {/* --------------------------- */}
      {/* 1. Left Control Panel       */}
      {/* --------------------------- */}
      <div className="flex flex-col w-1/2 space-y-6 pr-8">
        
        {/* Header with title and switch */}
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">新建AI人物</h1>
          <div className="flex items-center space-x-2">
            <Label htmlFor="ai-optimize" className="text-muted-foreground">AI优化</Label>
            <Switch id="ai-optimize" defaultChecked />
          </div>
        </header>

        {/* Random generation button */}
        <div>
          <Button variant="secondary">随机生成</Button>
        </div>

        {/* Description text box */}
        <div className="p-4 rounded-lg bg-card text-card-foreground shadow-sm min-h-[150px]">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {characterDescription}
          </p>
        </div>

        {/* Reference image upload */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">参考图片 (可选)</h2>
            <span className="text-sm text-muted-foreground">{files.length}/3张图片</span>
          </div>
          <p className="text-sm text-muted-foreground">
            上传一张头像图片，生成与该头像相似的角色
          </p>
          
          {/* Upload box */}
          <Dropzone
            maxFiles={3}
            src={files}
            onDrop={(acceptedFiles) => {
              setFiles(
                [...files, ...acceptedFiles].slice(0, 3)
              );
            }}
            className="w-full"
          >
            {files.length > 0 ? <DropzoneContent /> : <DropzoneEmptyState />}
          </Dropzone>
        </div>

        {/* Generate button -> triggers Dialog */}
        <div className="pt-4">
          <Button 
            size="lg" 
            className="w-48"
            onClick={() => setIsModalOpen(true)} // Open the modal on click
          >
            生成人物
          </Button>
        </div>

      </div>

      {/* --------------------------- */}
      {/* 2. Right Preview Area       */}
      {/* --------------------------- */}
      <div className="flex-1 flex items-center justify-center bg-card rounded-lg">
        <User className="w-40 h-40 text-muted-foreground" />
      </div>


      {/* --------------------------- */}
      {/* 3. Generation Result Modal  */}
      {/* --------------------------- */}
      <CreationSuccessModal 
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        generatedImageUrl={generatedImageUrl}
      />

    </div>
  );
}