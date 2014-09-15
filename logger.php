<?php

require 'LoggerConfig.php';

$obj = new JsLogFlush(LoggerConfig::get());
if ($ret = $obj->process()) {
    header('Content-Type: text/javascript');
    echo $ret;
}
