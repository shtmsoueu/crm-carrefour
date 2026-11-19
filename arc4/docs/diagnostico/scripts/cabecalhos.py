import sys, zipfile, io, csv, glob, os
for p in sorted(glob.glob(sys.argv[1]+"/*0144*.zip"))+sorted(glob.glob(sys.argv[1]+"/*AVALISTAS_0140*.zip")):
    z=zipfile.ZipFile(p); n=z.namelist()[0]
    raw=z.open(n).read(4000).decode('latin-1')
    lines=raw.splitlines()
    print("===",os.path.basename(p))
    hdr=lines[0].split(';')
    print(len(hdr),"cols")
    for i,h in enumerate(hdr):
        vals=[l.split(';')[i] if i<len(l.split(';')) else '' for l in lines[1:4]]
        print(f"  {i:02d} {h!r:40} {vals}")
