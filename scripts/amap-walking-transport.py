#!/usr/bin/env python3
"""Optional Mac readonly transport. One live request, private existing key, strict standard CA."""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import signal
import socket
import ssl
import stat
import urllib.error
import urllib.parse
import urllib.request

FAILURES = {'10001':'auth_unavailable','10002':'auth_unavailable','10003':'quota_exhausted','10004':'rate_limited','10005':'auth_unavailable','10006':'auth_unavailable','10007':'auth_unavailable','10009':'auth_unavailable','10012':'auth_unavailable','10013':'auth_unavailable','10014':'rate_limited','10019':'rate_limited','10020':'rate_limited'}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args): return None

def timeout_handler(_signum, _frame): raise TimeoutError()

def category(error):
    if isinstance(error, urllib.error.HTTPError): return 'http_error'
    if isinstance(error, urllib.error.URLError): return category(error.reason) if isinstance(error.reason, BaseException) else 'network_error'
    if isinstance(error, socket.gaierror): return 'dns_error'
    if isinstance(error, ssl.SSLCertVerificationError): return 'tls_certificate_error'
    if isinstance(error, ssl.SSLError): return 'tls_error'
    if isinstance(error, (TimeoutError, socket.timeout)): return 'timeout'
    if isinstance(error, PermissionError): return 'local_permission_denied'
    if isinstance(error, ConnectionError): return 'connection_error'
    return 'network_error'

def canonical_descriptor(value):
    if isinstance(value,dict): return '{'+','.join(json.dumps(key,ensure_ascii=False)+':'+canonical_descriptor(value[key]) for key in sorted(value))+'}'
    if isinstance(value,str): return json.dumps(value,ensure_ascii=False,separators=(',',':'))
    if type(value) is int: return str(value)
    if type(value) is float:
        if value==0: return '0'
        return format(value,'.6f').rstrip('0').rstrip('.')
    raise ValueError()

def validate_request(value):
    if isinstance(value, dict) and 'descriptor' in value: value=value['descriptor']
    if not isinstance(value, dict) or set(value)!={'schemaVersion','query','binding','asOf','ttlSeconds','requestHash'} or value['schemaVersion']!=1: raise ValueError()
    if not isinstance(value['requestHash'],str) or not re.fullmatch(r'sha256:[0-9a-f]{64}',value['requestHash']): raise ValueError()
    if datetime.datetime.fromisoformat(value['asOf'].replace('Z','+00:00')).tzinfo is None: raise ValueError()
    if type(value['ttlSeconds']) is not int or not 1<=value['ttlSeconds']<=300: raise ValueError()
    query=value['query']
    if not isinstance(query,dict) or set(query)!={'provider','mode','from','to'} or query['provider']!='amap' or query['mode']!='walking': raise ValueError()
    for label in ['from','to']:
        point=query[label]
        if not isinstance(point,dict) or set(point)!={'longitude','latitude','crs'} or point['crs']!='GCJ02': raise ValueError()
        for key,limit in [('longitude',180),('latitude',90)]:
            coordinate=point[key]
            if type(coordinate) not in (int,float) or not math.isfinite(coordinate) or not -limit<=coordinate<=limit or coordinate!=round(coordinate,6): raise ValueError()
    binding=value['binding']
    if not isinstance(binding,dict) or set(binding)!={'tripId','dateId','planId','fromStopId','toStopId','fromContentToken','toContentToken'}: raise ValueError()
    datetime.date.fromisoformat(binding['dateId'])
    for key in ['tripId','planId','fromStopId','toStopId']:
        if not isinstance(binding[key],str) or not 1<=len(binding[key])<=200 or binding[key] in ['__proto__','constructor','prototype']: raise ValueError()
    for key in ['fromContentToken','toContentToken']:
        if not isinstance(binding[key],str) or not re.fullmatch(r'sha256:[0-9a-f]{64}',binding[key]): raise ValueError()
    content={key:entry for key,entry in value.items() if key!='requestHash'}
    expected='sha256:'+hashlib.sha256(canonical_descriptor(content).encode()).hexdigest()
    if value['requestHash']!=expected: raise ValueError()
    return value

def decode_provider(body):
    if not isinstance(body,dict): raise ValueError()
    code=body.get('infocode')
    fields={'infocode':code} if isinstance(code,str) and re.fullmatch(r'\d{5}',code) else {}
    if body.get('status')!='1' or code!='10000': return {'ok':False,'failureCode':FAILURES.get(code,'provider_unavailable'),**fields}
    route=body.get('route')
    paths=route.get('paths') if isinstance(route,dict) else None
    if not isinstance(paths,list) or not paths or not isinstance(paths[0],dict): raise ValueError()
    estimate={}
    for source,target in [('distance','distanceMeters'),('duration','durationSeconds')]:
        value=paths[0].get(source)
        if type(value) not in (str,int,float) or not re.fullmatch(r'\d{1,12}(?:\.\d{1,6})?',str(value)): raise ValueError()
        number=float(value)
        if not math.isfinite(number) or number<0: raise ValueError()
        estimate[target]=number
    return {'ok':True,'estimate':estimate,**fields}

def existing_key():
    path=Path('/Users/g4i/Library/Application Support/Shadow/Shadow/map-provider-credentials.ini')
    info=path.stat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o600: raise PermissionError()
    target=hashlib.sha256(('dev.shadow.photo.maps\0amap-web-service-api-key').encode()).hexdigest()
    section=''
    with path.open() as handle:
        for line in handle:
            if line.startswith('['): section=line.strip()[1:-1]; continue
            name,separator,value=line.partition('=')
            if section=='credentials' and separator and name.strip()==target:
                candidate=value.strip()
                if re.fullmatch(r'[a-fA-F0-9]{32}',candidate): return candidate
    return None

def live(descriptor):
    diagnostics={'attemptedCalls':0,'maxCalls':1,'retries':0,'strictTLS':True,'hostnameVerification':True,'caBundle':'certifi-standard'}
    result={'schemaVersion':1,'requestHash':descriptor['requestHash'],'query':descriptor['query'],'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'captureKind':'live','ok':False,'failureCode':'provider_unavailable','diagnostics':diagnostics}
    phase='ca'
    try:
        import certifi
        context=ssl.create_default_context(cafile=certifi.where())
        assert context.check_hostname and context.verify_mode==ssl.CERT_REQUIRED
        phase='credential'
        credential=existing_key()
        if not credential: diagnostics['category']='credential_unavailable'; result['failureCode']='auth_unavailable'; return result
        query=descriptor['query']
        coordinates=lambda point:f"{point['longitude']:.6f},{point['latitude']:.6f}"
        parameters=urllib.parse.urlencode({'key':credential,'origin':coordinates(query['from']),'destination':coordinates(query['to']),'output':'JSON'})
        request=urllib.request.Request('https://restapi.amap.com/v3/direction/walking?'+parameters,headers={'Accept':'application/json','User-Agent':'Plan-gacha-bounded-readonly-walking/1'})
        opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=context),NoRedirect)
        signal.signal(signal.SIGALRM,timeout_handler); signal.alarm(6)
        phase='http'; diagnostics['attemptedCalls']=1
        with opener.open(request,timeout=4) as response:
            result['httpStatus']=response.status
            phase='response'
            body=json.loads(response.read(131072))
        parsed=decode_provider(body)
        result.update(parsed)
        if parsed['ok']:
            result.pop('failureCode',None); diagnostics['category']='success'
        else: diagnostics['category']='provider_rejected'
    except Exception as error:
        diagnostics['category']='ca_unavailable' if phase=='ca' else 'credential_unavailable' if phase=='credential' else 'invalid_response' if phase=='response' else category(error)
        if phase=='credential': result['failureCode']='auth_unavailable'
        if isinstance(error,urllib.error.HTTPError):
            result['httpStatus']=error.code
            try:
                parsed=decode_provider(json.loads(error.read(131072)))
                if not parsed['ok']: result.update(parsed)
            except Exception: pass
    finally: signal.alarm(0)
    return result

def fixtures():
    secret='FIXTURE_SECRET_NEVER_EMITTED'
    cases=[({'status':'0','infocode':'10001','info':secret},'auth_unavailable'),({'status':'0','infocode':'10003','info':secret},'quota_exhausted'),({'status':'0','infocode':'10014','info':secret},'rate_limited'),({'status':'0','infocode':secret,'info':secret},'provider_unavailable')]
    outputs=[]
    for body,expected in cases:
        parsed=decode_provider(body); assert not parsed['ok'] and parsed['failureCode']==expected; outputs.append(parsed)
    parsed=decode_provider({'status':'1','infocode':'10000','route':{'paths':[{'distance':'120','duration':'90','instruction':secret}]}})
    assert parsed['estimate']=={'distanceMeters':120.0,'durationSeconds':90.0}; outputs.append(parsed)
    bad=[{}, {'status':'1','infocode':'10000','route':{'paths':[]}}, {'status':'1','infocode':'10000','route':{'paths':[{'distance':secret,'duration':'90'}]}}, {'status':'1','infocode':'10000','route':{'paths':[{'distance':'120','duration':'-1'}]}}]
    for body in bad:
        try:
            output=decode_provider(body)
            assert not output['ok']; outputs.append(output)
        except ValueError: pass
    assert secret not in json.dumps(outputs)
    for error,expected in [(urllib.error.URLError(socket.gaierror(-2,secret)),'dns_error'),(ssl.SSLCertVerificationError(1,secret),'tls_certificate_error'),(TimeoutError(secret),'timeout'),(urllib.error.HTTPError('https://example.invalid/?key='+secret,403,secret,{},None),'http_error')]: assert category(error)==expected
    return {'ok':True,'fixtures':13,'liveRequests':0,'secretOrURLRecorded':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request'); parser.add_argument('--live',action='store_true'); parser.add_argument('--fixtures',action='store_true')
    args=parser.parse_args()
    if args.fixtures: print(json.dumps(fixtures()))
    elif args.live and args.request:
        try:
            descriptor=validate_request(json.loads(Path(args.request).read_text()))
            print(json.dumps(live(descriptor)))
        except Exception: print(json.dumps({'ok':False,'saved':False,'category':'invalid_request','attemptedCalls':0})); raise SystemExit(1)
    else: print(json.dumps({'ok':False,'saved':False,'category':'explicit_live_request_required','attemptedCalls':0})); raise SystemExit(1)
