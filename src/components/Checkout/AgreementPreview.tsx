import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, ShieldX } from "lucide-react";
import PDFViewer from "@/components/PDFViewer";

interface AgreementPreviewProps {
  onAgree: () => void;
  insuranceStatus?: 'pending' | 'insured' | 'uninsured' | 'waived';
}

const AgreementPreview = ({ onAgree, insuranceStatus }: AgreementPreviewProps) => {
  return (
    <Card>
      {insuranceStatus && (
        <CardHeader>
          <CardTitle className="flex items-center">
            {insuranceStatus === 'pending' || insuranceStatus === 'insured' ? (
              <ShieldCheck className="mr-2 h-5 w-5 text-green-500" />
            ) : (
              <ShieldX className="mr-2 h-5 w-5 text-red-500" />
            )}
            Insurance Status: {insuranceStatus.charAt(0).toUpperCase() + insuranceStatus.slice(1)}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-4">
        <PDFViewer
          file="/agreement.pdf"
        />
      </CardContent>
      <CardFooter className="flex justify-end p-4">
        <Button onClick={onAgree}>Agree and Sign</Button>
      </CardFooter>
    </Card>
  );
};

export default AgreementPreview;
