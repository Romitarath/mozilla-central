/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Pierre Phaneuf <pp@ludusdesign.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */
#include "nsICharsetConverterManager.h"
#include <iostream.h>
#include "nsISupports.h"
#include "nsIComponentManager.h"
#include "nsIServiceManager.h"
#include "nsIUnicodeDecoder.h"
#include "nsIUnicodeEncoder.h"
#include "nsCRT.h"
#include <stdio.h>
#include <stdlib.h>
#if defined(XP_WIN) || defined(XP_OS2)
#include <io.h>
#endif
#ifdef XP_UNIX
#include <unistd.h>
#endif

//---------------------------------------------------------------------------
void header()
{
char *header=
"#ifndef nsCyrillicClass_h__\n"
"#define nsCyrillicClass_h__\n"
"/* PLEASE DO NOT EDIT THIS FILE DIRECTLY. THIS FILE IS GENERATED BY \n"
"   GenCyrllicClass found in mozilla/intl/chardet/tools\n"
" */\n";
   printf(header);
}
//---------------------------------------------------------------------------
void footer()
{
   printf("#endif\n");
}
//---------------------------------------------------------------------------
void npl()
{
char *npl=
"/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-\n"
"*\n"
"* The contents of this file are subject to the Netscape Public License\n"
"* Version 1.0 (the \"NPL\"); you may not use this file except in\n"
"* compliance with the NPL.  You may obtain a copy of the NPL at\n"
"* http://www.mozilla.org/NPL/\n"
"*\n"
"* Software distributed under the NPL is distributed on an \"AS IS\" basis,\n"
"* WITHOUT WARRANTY OF ANY KIND, either express or implied. See the NPL\n"
"* for the specific language governing rights and limitations under the\n"
"* NPL.\n"
"*\n"
"* The Initial Developer of this code under the NPL is Netscape\n"
"* Communications Corporation.  Portions created by Netscape are\n"
"* Copyright (C) 1998 Netscape Communications Corporation.  All Rights\n"
"* Reserved.\n"
"*/\n";
   printf(npl);
}
//---------------------------------------------------------------------------
static nsIUnicodeEncoder* gKOI8REncoder = nsnull;
static nsICharsetConverterManager* gCCM = nsnull;

//---------------------------------------------------------------------------
PRUint8 CyrillicClass(nsIUnicodeDecoder* decoder, PRUint8 byte)
{
   PRUnichar ubuf[2];
   PRUint8 bbuf[2];

   PRInt32 blen = 1;
   PRInt32 ulen = 1;
   nsresult res = decoder->Convert((char*)&byte, &blen, ubuf, &ulen);
   if(NS_SUCCEEDED(res) && (1 == ulen ))
   {
     ubuf[0] = nsCRT::ToUpper(ubuf[0]);
     blen=1;
     res = gKOI8REncoder->Convert(ubuf,&ulen,(char*)bbuf,&blen);
     if(NS_SUCCEEDED(res) && (1 == blen))
     {
        if(0xe0 <= bbuf[0])
        {
              return bbuf[0] - (PRUint8)0xdf;
        }
     }
   }
   return 0;
}
//---------------------------------------------------------------------------
void genCyrillicClass(const char* name, const char* charset)
{
   nsIUnicodeDecoder *decoder = nsnull;
   nsresult res = NS_OK;
   nsAutoString str(charset);
   res = gCCM->GetUnicodeDecoder(&str, &decoder);
   if(NS_FAILED(res))
   {
      printf("cannot locate %s Decoder\n", charset);
      return;
   }
   printf("static const PRUint8 %sMap [128] = {\n",name);
   PRUint8 i,j;
   for(i=0x80;i!=0x00;i+=0x10)
   {
     for(j=0;j<=0x0f;j++)
     {
        PRUint8 cls = CyrillicClass(decoder, i+j);
        printf(" %2d, ",cls);
     }
     printf("\n");
   }
   printf("};\n");
   NS_IF_RELEASE(decoder);
}
//---------------------------------------------------------------------------


int main(int argc, char** argv) {
  nsresult res = nsnull;

  nsCOMPtr<nsICharsetConverterManager> gCCM = do_GetService(kCharsetConverterManagerCID, &res);

  if(NS_FAILED(res) && (nsnull != gCCM))
   {
      printf("cannot locate CharsetConverterManager\n");
      return(-1);
   }
   nsAutoString koi8r("KOI8-R");
   res = gCCM->GetUnicodeEncoder(&koi8r,&gKOI8REncoder);
   if(NS_FAILED(res) && (nsnull != gKOI8REncoder))
   {
      printf("cannot locate KOI8-R Encoder\n");
      return(-1);
   }


   npl();
   header();
   
     genCyrillicClass("KOI8", "KOI8-R");
     genCyrillicClass("CP1251", "windows-1251");
     genCyrillicClass("IBM866", "IBM866");
     genCyrillicClass("ISO88595", "ISO-8859-5");
     genCyrillicClass("MacCyrillic", "x-mac-cyrillic");
   footer();
   NS_IF_RELEASE(gKOI8REncoder);
   return(0);
};
