package site.medipick.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PREFS="medipick_android";
    private static final String OFFICIAL_URL="https://medipick.lexid.site/smart-store";
    private static final int IMAGE_REQUEST=701;
    private static final int GEO_REQUEST=702;
    private static final String DEV_URL="http://10.0.2.2:8765"; // Emulator-only in debug builds.
    private WebView web;
    private View offlinePanel;
    private ProgressBar progress;
    private TextView title;
    private ValueCallback<Uri[]> photoCallback;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private String baseUrl;

    @Override public void onCreate(Bundle savedInstanceState){
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(13,59,129));
        getWindow().setNavigationBarColor(Color.rgb(247,250,255));
        setContentView(makeLayout());
        baseUrl=getPreferences().getString("siteUrl",OFFICIAL_URL);
        if(isAllowedSite(baseUrl)) openSite(); else showSiteSetup();
    }

    private SharedPreferences getPreferences(){return getSharedPreferences(PREFS,MODE_PRIVATE);}
    private int dp(int value){return (int)(value*getResources().getDisplayMetrics().density+0.5f);}
    private Button toolbarButton(String label){
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(13);b.setPadding(dp(4),0,dp(4),0);return b;
    }
    private View makeLayout(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setFitsSystemWindows(true);root.setBackgroundColor(Color.WHITE);
        LinearLayout bar=new LinearLayout(this);bar.setOrientation(LinearLayout.HORIZONTAL);bar.setBackgroundColor(Color.rgb(238,245,255));bar.setPadding(dp(5),dp(4),dp(5),dp(4));
        title=new TextView(this);title.setText("✚ MEDIPICK");title.setTextColor(Color.rgb(11,58,137));title.setTextSize(18);title.setTypeface(null,1);title.setGravity(android.view.Gravity.CENTER_VERTICAL);
        bar.addView(title,new LinearLayout.LayoutParams(0,dp(46),1));
        Button back=toolbarButton("뒤로");back.setOnClickListener(v->{if(web.canGoBack())web.goBack();else web.loadUrl(baseUrl);});bar.addView(back,new LinearLayout.LayoutParams(dp(56),dp(46)));
        Button refresh=toolbarButton("새로고침");refresh.setOnClickListener(v->web.reload());bar.addView(refresh,new LinearLayout.LayoutParams(dp(86),dp(46)));
        Button menu=toolbarButton("설정");menu.setOnClickListener(v->showMenu());bar.addView(menu,new LinearLayout.LayoutParams(dp(55),dp(46)));
        root.addView(bar);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(100);root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));
        web=new WebView(this);web.setBackgroundColor(Color.WHITE);
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);s.setGeolocationEnabled(true);s.setSafeBrowsingEnabled(true);
        web.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();String scheme=uri.getScheme();
                if("https".equalsIgnoreCase(scheme)||"http".equalsIgnoreCase(scheme)){
                    if(sameOrigin(uri)){
                        String path=uri.getPath()==null?"":uri.getPath();
                        // Google OAuth must run in the system browser, not embedded WebView.
                        if(path.startsWith("/auth/") || path.startsWith("/api/auth/")){openExternal(uri);return true;}
                        return false;
                    }
                    openExternal(uri);return true;
                }
                if("tel".equals(scheme)||"mailto".equals(scheme)){openExternal(uri);return true;}
                // Disallow arbitrary intent://, file:// and untrusted deep links.
                return true;
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){
                handler.cancel();Toast.makeText(MainActivity.this,"보안 인증서 오류로 연결이 차단되었습니다.",Toast.LENGTH_LONG).show();
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){
                showOfflineState(false);
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(request.isForMainFrame())showOfflineState(true);
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,android.webkit.WebResourceResponse response){
                if(request.isForMainFrame() && response.getStatusCode() >= 400)showOfflineState(true);
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);progress.setVisibility(value>=100?View.GONE:View.VISIBLE);}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> cb,FileChooserParams chooser){
                if(photoCallback!=null)photoCallback.onReceiveValue(null);
                photoCallback=cb;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.setType("image/*");intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/jpeg","image/png","image/webp"});
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {startActivityForResult(intent,IMAGE_REQUEST);}catch(Exception e){photoCallback.onReceiveValue(null);photoCallback=null;return false;}
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();} // Camera/microphone are never granted to web content.
            @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){
                if(!sameOrigin(Uri.parse(origin))){cb.invoke(origin,false,false);return;}
                if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED){cb.invoke(origin,true,false);return;}
                geoCallback=cb;geoOrigin=origin;requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION},GEO_REQUEST);
            }
        });
        FrameLayout content=new FrameLayout(this);
        content.addView(web,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        offlinePanel=createOfflinePanel();
        offlinePanel.setVisibility(View.GONE);
        content.addView(offlinePanel,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(content,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
        return root;
    }

    private View createOfflinePanel(){
        LinearLayout panel=new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(26),dp(26),dp(26),dp(26));
        panel.setBackgroundColor(Color.rgb(245,249,255));
        panel.setContentDescription("메디픽 오프라인 안내");

        TextView symbol=new TextView(this);
        symbol.setText("✚");symbol.setTextSize(44);symbol.setGravity(Gravity.CENTER);
        symbol.setTextColor(Color.rgb(10,106,232));
        panel.addView(symbol,new LinearLayout.LayoutParams(-1,dp(72)));

        TextView heading=new TextView(this);
        heading.setText("인터넷 연결을 확인해 주세요");heading.setTextSize(22);
        heading.setTypeface(null,1);heading.setTextColor(Color.rgb(12,45,94));
        heading.setGravity(Gravity.CENTER);
        panel.addView(heading,new LinearLayout.LayoutParams(-1,dp(58)));

        TextView copy=new TextView(this);
        copy.setText("병원·약국 정보를 보려면\n인터넷 연결이 필요합니다.\n연결 후 다시 시도해 주세요.");
        copy.setTextSize(14);copy.setGravity(Gravity.CENTER);copy.setTextColor(Color.rgb(79,104,137));
        copy.setLineSpacing(dp(4),1);
        panel.addView(copy,new LinearLayout.LayoutParams(-1,dp(100)));

        Button retry=toolbarButton("↻ 다시 연결");
        retry.setTextSize(16);retry.setAllCaps(false);
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(11,102,223)));
        retry.setOnClickListener(v->{showOfflineState(false);web.reload();});
        LinearLayout.LayoutParams retryParams=new LinearLayout.LayoutParams(-1,dp(52));
        retryParams.setMargins(0,dp(14),0,dp(10));
        panel.addView(retry,retryParams);

        Button browser=toolbarButton("브라우저에서 열기");
        browser.setTextSize(15);
        browser.setTextColor(Color.rgb(11,82,180));
        browser.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(228,240,255)));
        browser.setOnClickListener(v->openExternal(Uri.parse(baseUrl)));
        panel.addView(browser,new LinearLayout.LayoutParams(-1,dp(52)));
        return panel;
    }
    private void showOfflineState(boolean show){
        if(offlinePanel == null || web == null)return;
        offlinePanel.setVisibility(show?View.VISIBLE:View.GONE);
        web.setVisibility(show?View.INVISIBLE:View.VISIBLE);
        if(show)progress.setVisibility(View.GONE);
    }

    private void openExternal(Uri uri){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException e){Toast.makeText(this,"외부 링크를 열 수 없습니다.",Toast.LENGTH_SHORT).show();}}
    private boolean sameOrigin(Uri u){
        try {Uri base=Uri.parse(baseUrl);return base.getScheme().equalsIgnoreCase(u.getScheme())&&base.getHost().equalsIgnoreCase(u.getHost())&&base.getPort()==u.getPort();}catch(Exception e){return false;}
    }
    private boolean isAllowedSite(String value){
        if(value==null||value.trim().isEmpty())return false;
        try {Uri u=Uri.parse(value);String scheme=u.getScheme(),host=u.getHost();
            if(host==null||u.getUserInfo()!=null||u.getFragment()!=null||u.getQuery()!=null)return false;
            boolean production="https".equalsIgnoreCase(scheme)&&"medipick.lexid.site".equalsIgnoreCase(host);
            boolean emulator=BuildConfig.DEBUG&&DEV_URL.equals(value);
            return production||emulator;
        }catch(Exception e){return false;}
    }
    private void openSite(){web.loadUrl(baseUrl);}
    private void showSiteSetup(){
        EditText input=new EditText(this);input.setSingleLine(true);input.setHint("https://medipick.lexid.site/smart-store");input.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_URI);
        if(baseUrl!=null)input.setText(baseUrl);
        LinearLayout wrapper=new LinearLayout(this);wrapper.setOrientation(LinearLayout.VERTICAL);wrapper.setPadding(dp(22),dp(4),dp(22),dp(2));
        TextView msg=new TextView(this);msg.setText("메디픽의 HTTPS 서버 주소를 입력하세요. 이 앱은 기존 MEDIPICK 웹서버의 검색·예약·의료정보 기능에 연결됩니다. 구글 로그인은 보안상 외부 브라우저에서 수행합니다.");msg.setTextColor(Color.DKGRAY);msg.setPadding(0,0,0,dp(14));wrapper.addView(msg);wrapper.addView(input);
        new AlertDialog.Builder(this).setTitle("메디픽 서버 연결").setView(wrapper).setCancelable(false)
          .setPositiveButton("연결",(dialog,which)->{
              String v=input.getText().toString().trim().replaceAll("/+$","");
              if(isAllowedSite(v)){baseUrl=v;getPreferences().edit().putString("siteUrl",v).apply();openSite();}
              else {Toast.makeText(this,"유효한 HTTPS 주소가 필요합니다.",Toast.LENGTH_LONG).show();showSiteSetup();}
          }).setNegativeButton("종료",(dialog,which)->finish()).show();
    }
    private void showMenu(){
        new AlertDialog.Builder(this).setTitle("메디픽 설정")
          .setItems(new String[]{"홈으로","브라우저에서 열기 (Google 로그인 권장)","서버 주소 변경","이 기기에서 쿠키·웹 데이터 삭제"},(d,position)->{
              switch(position){
                  case 0:openSite();break;
                  case 1:openExternal(Uri.parse(baseUrl));break;
                  case 2:showSiteSetup();break;
                  case 3:new AlertDialog.Builder(this).setTitle("기기 데이터 삭제")
                    .setMessage("이 앱에 저장된 쿠키와 웹 저장소를 삭제하고 로그아웃합니다. 서버의 의료기록은 삭제되지 않습니다.")
                    .setPositiveButton("삭제",(a,b)->{
                        CookieManager.getInstance().removeAllCookies(null);CookieManager.getInstance().flush();
                        web.clearCache(true);web.clearHistory();android.webkit.WebStorage.getInstance().deleteAllData();openSite();
                    }).setNegativeButton("취소",null).show();break;
              }
          }).show();
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==IMAGE_REQUEST&&photoCallback!=null){
            Uri uri=(resultCode==RESULT_OK&&data!=null)?data.getData():null;
            photoCallback.onReceiveValue(uri==null?null:new Uri[]{uri});photoCallback=null;
        }
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){
        super.onRequestPermissionsResult(requestCode,permissions,grantResults);
        if(requestCode==GEO_REQUEST&&geoCallback!=null){
            boolean ok=grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED;
            geoCallback.invoke(geoOrigin,ok,false);geoCallback=null;geoOrigin=null;
        }
    }
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){
        if(photoCallback!=null){photoCallback.onReceiveValue(null);photoCallback=null;}
        if(web!=null){web.destroy();web=null;}super.onDestroy();
    }
}
