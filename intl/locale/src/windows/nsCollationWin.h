
/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * ***** BEGIN LICENSE BLOCK *****
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
#ifndef nsCollationWin_h__
#define nsCollationWin_h__


#include "nsICollation.h"
#include "nsCollation.h"  // static library
#include "plstr.h"



class nsCollationWin : public nsICollation {

protected:
  nsCollation   *mCollation;  // XP collation class
  PRBool        mW_API;       // If Windows95 or 98, we cannot use W version of API
  PRUint32      mLCID;        // Windows platform locale ID

public: 
  NS_DECL_ISUPPORTS
    
  // compare two strings
  // result is same as strcmp
  NS_IMETHOD CompareString(const nsCollationStrength strength, 
                           const nsAString& string1, const nsAString& string2, PRInt32* result);

  // allocate sort key from input string
  // returns newly allocated key and its byte length
  NS_IMETHOD AllocateRawSortKey(const nsCollationStrength strength, 
                                const nsAString& stringIn, PRUint8** key, PRUint32 *outLen);

  // compare two sort keys
  // length is a byte length, result is same as strcmp
  NS_IMETHOD CompareRawSortKey(const PRUint8* key1, const PRUint32 len1, 
                               const PRUint8* key2, const PRUint32 len2, 
                               PRInt32* result)
                               {*result = PL_strcmp((const char *)key1, (const char *)key2); return NS_OK;}

  // init this interface to a specified locale (should only be called by collation factory)
  //
  NS_IMETHOD Initialize(nsILocale* locale);

  nsCollationWin();

  virtual ~nsCollationWin(); 

};

#endif  /* nsCollationWin_h__ */
