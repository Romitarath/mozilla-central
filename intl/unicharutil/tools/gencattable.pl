#!/usr/bin/perl 
#
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is mozilla.org code.
#
# The Initial Developer of the Original Code is
# Netscape Communications Corporation.
# Portions created by the Initial Developer are Copyright (C) 1999
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#
# Alternatively, the contents of this file may be used under the terms of
# either of the GNU General Public License Version 2 or later (the "GPL"),
# or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

######################################################################
#
# Initial global variable
#
######################################################################

%gcount = ();
%pat = ();

%map = (
  "M" => "1",
  "N" => "2",
  "Z" => "3",
  "C" => "4",
  "L" => "5",
  "P" => "6",
  "S" => "7"
);

%special = ();

######################################################################
#
# Open the unicode database file
#
######################################################################
open ( UNICODATA , "< UnicodeData-Latest.txt") 
   || die "cannot find UnicodeData-Latest.txt";

######################################################################
#
# Open the output file
#
######################################################################
open ( OUT , "> ../src/cattable.h") 
  || die "cannot open output ../src/cattable.h file";

######################################################################
#
# Generate license and header
#
######################################################################
$npl = <<END_OF_NPL;
/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * The contents of this file are subject to the Netscape Public License
 * Version 1.0 (the "NPL"); you may not use this file except in
 * compliance with the NPL.  You may obtain a copy of the NPL at
 * http://www.mozilla.org/NPL/
 *
 * Software distributed under the NPL is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the NPL
 * for the specific language governing rights and limitations under the
 * NPL.
 *
 * The Initial Developer of this code under the NPL is Netscape
 * Communications Corporation.  Portions created by Netscape are
 * Copyright (C) 1999 Netscape Communications Corporation.  All Rights
 * Reserved.
 */
/* 
    DO NOT EDIT THIS DOCUMENT !!! THIS DOCUMENT IS GENERATED BY
    mozilla/intl/unicharutil/tools/gencattable.pl
 */
END_OF_NPL
print OUT $npl;

print OUT "#include \"nscore.h\" \n\n";


%category = ();
%sh = ();
%sl = ();
%sc = ();

######################################################################
#
# Process the file line by line
#
######################################################################
while(<UNICODATA>) {
   chop;
   ######################################################################
   #
   # Get value from fields
   #
   ######################################################################
   @f = split(/;/ , $_); 
   $c = $f[0];   # The unicode value
   $n = $f[1];   # The unicode name
   $g = $f[2];   # The General Category 

   $cat = substr($g, 0, 1);
   if(( substr($n, 0, 1) ne "<")  || ($n eq "<control>"))
   {
      #
      # print $g;
      # 
     
      $gcount{$g}++;
      $gcount{$cat}++;
      $category{$c} = $cat;
      # print $g . " = " . $gcount{$g} . "\n";
   } else {

      # Handle special block
      @pair=split(/, /,  $n );
      $catnum = $map{$cat};

      # printf "[%s][%s] => %d\n", $pair[0], $pair[1], $catnum;
      if( $pair[1] eq "First>") {
         $sl{$pair[0]} = $c;
         $sc{$pair[0]} = $catnum;
      } elsif ( $pair[1] eq "Last>") {
         $sh{$pair[0]} = $c;
         if($sc{$pair[0]} ne $catnum)
         {
            print "WARNING !!!! error in handling special block\n\n";
         }
      } else {
         print "WARNING !!!! error in handling special block\n\n";
      }
   }
}

# @cats = keys(%gcount);
# foreach $cat ( sort(@cats) ) {
#    $count = $gcount{$cat};
#    print "$cat ==> $count\n";
# }


@range = (
  0x0000, 0x06ff, 
  0x0900, 0x11ff,
  0x1e00, 0x27ff,
  0x3000, 0x33ff,
  0xf900, 0xffff
);


$totaldata = 0;

$tt=($#range+1) / 2;
$newidx = 0;
@patarray = ();

for($t = 1; $t <= $tt; $t++)
{
   $tl = $range[($t-1) * 2];
   $th = $range[($t-1) * 2 + 1];
   $ts = ( $th - $tl ) >> 3;
   $totaldata += $ts + 1;
   printf OUT "static const PRUint8 gGenCatIdx%d[%d] = {\n", $t, $ts + 1;
   for($i = ($tl >> 3); $i <= ($th >> 3) ; $i ++ )
   {
      $data = 0;
      for($j = 0; $j < 8 ; $j++)
      {
         $k =  sprintf("%04X", (($i << 3) + $j));
      
         $cat =  $category{$k};
         if( $cat ne "")
         {
             $data = $data +  ($map{$cat} << (4*$j));
         }
      }
      $pattern = sprintf("0x%08X", $data);
   
      $idx = $pat{$pattern};
      unless( exists($pat{$pattern})){
         $idx = $newidx++;
         $patarray[$idx] = $pattern;
         $pat{$pattern} = $idx;
      }

      printf OUT "    %3d,  // U+%04X - U+%04X : %s\n" , 
                 $idx, ($i << 3),((($i +1)<< 3)-1), $pattern ;

   
   }
   printf OUT "};\n\n";

   if($t ne $tt)
   {
       $tl = $range[($t-1) * 2 + 1] + 1;
       $th = $range[$t * 2] - 1;
       for($i = ($tl >> 3); $i <= ($th >> 3) ; $i ++ )
       {
          $data = 0;
          for($j = 0; $j < 8 ; $j++)
          {
             $k =  sprintf("%04X", (($i << 3) + $j));
      
             $cat =  $category{$k};
             if( $cat ne "")
             {
                 $data = $data +  ($map{$cat} << (4*$j));
             }
          }
          $pattern = sprintf("0x%08X", $data);
          if($data ne 0)
          {
             print "WARNING, Unicode Database now contain characters" .
                   "which we have not consider, change this program !!!\n\n";
             printf "Problem- U+%04X - U+%04X range\n", ($i << 3),((($i +1)<< 3)-1);
          }
       }
   }
}


if($newidx > 255)
{
  die "We have more than 255 patterns !!! - $newidx\n\n" .
      "This program is now broken!!!\n\n\n";      

}
printf OUT "static const PRUint32 gGenCatPat[$newidx] = {\n";
for($i = 0 ; $i < $newidx; $i++)
{
   printf OUT "    %s,  // $i \n", $patarray[$i] ;
}
printf OUT "};\n\n";
$totaldata += $newidx * 4;

printf OUT "static PRUint8 GetCat(PRUnichar u)\n{\n";
printf OUT "    PRUint32 pat;\n";
printf OUT "    //\n";
printf OUT "    //  Handle block which use index table mapping    \n";
printf OUT "    //\n";
for($t = 1; $t <= $tt; $t++)
{
   $tl = $range[($t-1) * 2];
   $th = $range[($t-1) * 2 + 1];
   printf OUT "    // Handle U+%04X to U+%04X\n", $tl, $th;
   printf OUT "    if((((PRUnichar)0x%04X)<=u)&&(u<=((PRUnichar)0x%04X))) {\n", $tl, $th;
   printf OUT "        pat = gGenCatPat[gGenCatIdx%d [( u -(PRUnichar) 0x%04X )]];\n", $t, $tl;
   printf OUT "        return (pat  >> ((u % 8) * 4)) & 0x0F;\n";
   printf OUT "    }\n\n";
}

printf OUT "    //\n";
printf OUT "    //  Handle blocks which share the same category \n";
printf OUT "    //\n";


@special = keys(%sh);
foreach $s ( sort(@special) ) {
   printf OUT "    // Handle %s block \n", substr($s, 1,-1);
   printf OUT "    if((((PRUnichar)0x%s)<=u)&&(u<=((PRUnichar)0x%s))) \n", $sl{$s}, $sh{$s};
   printf OUT "        return $sc{$s}; \n\n";
}



printf OUT "    return 0; // UNDEFINE \n}\n";

printf OUT "// total data size = $totaldata\n";
#$total = 0;
#@pats = keys(%pat);
#foreach $pattern ( sort(@pats) ) {
#   $count = $pat{$pattern};
#   # print "$cat ==> $count\n";
#   $total++;
#}
print "total = $totaldata\n";

######################################################################
#
# Close files
#
######################################################################
close(UNIDATA);
close(OUT);

