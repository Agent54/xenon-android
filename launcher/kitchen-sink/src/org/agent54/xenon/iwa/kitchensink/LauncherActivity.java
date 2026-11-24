package org.agent54.xenon.iwa.kitchensink;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

/** Home-screen entry for one already-installed, signed Kitchen Sink IWA. */
public final class LauncherActivity extends Activity {
    private static final String BROWSER_PACKAGE = "org.agent54.xenon.iwa";
    private static final String BROWSER_ACTIVITY =
            "org.chromium.chrome.browser.webapps.IwaLauncherActivity";
    private static final String ACTION_LAUNCH = "org.agent54.xenon.iwa.LAUNCH";
    private static final String EXTRA_APP_ID = "org.agent54.xenon.iwa.APP_ID";
    private static final String KITCHEN_SINK_APP_ID = "idgjjoiemckfcohgjoaafbninphmambh";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent launch = new Intent(ACTION_LAUNCH);
        launch.setComponent(new ComponentName(BROWSER_PACKAGE, BROWSER_ACTIVITY));
        launch.putExtra(EXTRA_APP_ID, KITCHEN_SINK_APP_ID);
        try {
            startActivity(launch);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "Install Xenon IWA to open Kitchen Sink", Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
